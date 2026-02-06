// ---------------------------------------------------------------------------
// Gemini API Client
//
// Design inspired by nano_banana_renderer/services/api_client.rb:
//   - Typed error hierarchy (not a 1:1 translation)
//   - Exponential back-off retry on transient failures
//   - System instruction for composition preservation
//   - MIME detection from base64 prefix
// ---------------------------------------------------------------------------

// ── Error hierarchy ────────────────────────────────────────────────────────

export class GeminiError extends Error {
  status: number | null
  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'GeminiError'
    this.status = status
  }
}

export class AuthError extends GeminiError {
  constructor(message = 'Invalid or missing API key') {
    super(message, 401)
    this.name = 'AuthError'
  }
}

export class RateLimitError extends GeminiError {
  constructor(message = 'Rate limit exceeded — try again later') {
    super(message, 429)
    this.name = 'RateLimitError'
  }
}

export class ContentFilterError extends GeminiError {
  reason: string
  constructor(reason: string) {
    super(`Content blocked: ${reason}`)
    this.name = 'ContentFilterError'
    this.reason = reason
    this.status = 200 // response was 200, just filtered
  }
}

export class ServerError extends GeminiError {
  constructor(status: number) {
    super(`Gemini server error (${status})`)
    this.name = 'ServerError'
    this.status = status
  }
}

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-2.0-flash-exp-image-generation'
const MAX_RETRIES = 2
const REQUEST_TIMEOUT_MS = 120_000

// Maps engine field value → actual Gemini API model identifier
const ENGINE_MODEL_MAP: Record<string, string> = {
  main: 'gemini-2.0-flash-exp-image-generation',
  'experimental-exterior': 'gemini-2.0-flash-exp-image-generation',
  'experimental-interior': 'gemini-2.0-flash-exp-image-generation',
}

// Scene-composition-preserving system instruction.
// Ensures AI only changes textures/lighting, never layout or objects.
const SYSTEM_INSTRUCTION =
  'You are a photorealistic image renderer. ' +
  'Transform the input 3D scene into a photorealistic photograph. ' +
  'RULES — strictly follow every one:\n' +
  '1. Keep the EXACT same composition: every object stays at the same position and size.\n' +
  '2. Do NOT add, remove, move, or resize any object.\n' +
  '3. Only change surface materials to realistic textures, add natural lighting and shadows.\n' +
  '4. Camera angle, perspective, and framing must be identical to the input.\n' +
  '5. The result must look like a real photograph of the same scene.\n' +
  'Failure to follow these rules means the task has failed.'

// ── Helpers ────────────────────────────────────────────────────────────────

export function useMock(): boolean {
  const flag = import.meta.env.VITE_USE_MOCK
  if (flag === 'true' || flag === '1') return true
  // No API key → fall back to mock silently
  const key = import.meta.env.VITE_GEMINI_API_KEY
  return !key || key.trim().length === 0
}

function getApiKey(): string {
  const key = import.meta.env.VITE_GEMINI_API_KEY
  if (!key || key.trim().length === 0) {
    throw new AuthError('VITE_GEMINI_API_KEY is not set')
  }
  return key.trim()
}

function resolveModel(engine?: string): string {
  // 1) Explicit env override
  const envModel = import.meta.env.VITE_GEMINI_MODEL
  if (envModel && envModel.trim().length > 0) return envModel.trim()

  // 2) Engine → model mapping
  if (engine && engine in ENGINE_MODEL_MAP) return ENGINE_MODEL_MAP[engine]

  // 3) Default
  return DEFAULT_MODEL
}

/** Detect MIME type from the first few chars of raw base64 data. */
function detectMimeType(base64: string): string {
  if (base64.startsWith('iVBOR')) return 'image/png'
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('R0lGOD')) return 'image/gif'
  if (base64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}

/** Strip `data:…;base64,` prefix and return raw base64 + detected mimeType. */
function stripDataUri(input: string): { base64: string; mimeType: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/)
  if (match) return { mimeType: match[1], base64: match[2] }
  return { mimeType: detectMimeType(input), base64: input }
}

/** Exponential back-off: 1 s, 2 s, 4 s … */
function backoffMs(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 16_000)
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Core API call ──────────────────────────────────────────────────────────

export interface GeminiResult {
  image: string | null // raw base64 (no data-URI prefix)
  text: string | null
}

export interface CallGeminiOptions {
  image: string // data URI or raw base64
  prompt: string
  engine?: string // maps to model
  systemInstruction?: string // override default
  responseModalities?: ('TEXT' | 'IMAGE')[]
}

export async function callGemini(
  opts: CallGeminiOptions,
): Promise<GeminiResult> {
  const apiKey = getApiKey()
  const model = resolveModel(opts.engine)
  const sysText = opts.systemInstruction ?? SYSTEM_INSTRUCTION
  const modalities = opts.responseModalities ?? ['TEXT', 'IMAGE']
  const { base64, mimeType } = stripDataUri(opts.image)

  const body = {
    system_instruction: { parts: [{ text: sysText }] },
    contents: [
      {
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: opts.prompt },
        ],
      },
    ],
    generationConfig: { responseModalities: modalities },
  }

  return sendWithRetry(model, apiKey, body, 0)
}

// ── HTTP layer with retry ──────────────────────────────────────────────────

async function sendWithRetry(
  model: string,
  apiKey: string,
  body: unknown,
  attempt: number,
): Promise<GeminiResult> {
  const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timer)
    // Network error or abort (timeout)
    if (attempt < MAX_RETRIES) {
      await sleep(backoffMs(attempt))
      return sendWithRetry(model, apiKey, body, attempt + 1)
    }
    throw new GeminiError(
      `Request failed after ${MAX_RETRIES + 1} attempts: ${String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }

  // ── Status-based error handling ──
  switch (res.status) {
    case 200:
      return parseResponse(await res.json())

    case 401:
    case 403:
      throw new AuthError()

    case 429: {
      if (attempt < MAX_RETRIES) {
        await sleep(backoffMs(attempt))
        return sendWithRetry(model, apiKey, body, attempt + 1)
      }
      throw new RateLimitError()
    }

    default:
      if (res.status >= 500) {
        if (attempt < MAX_RETRIES) {
          await sleep(backoffMs(attempt))
          return sendWithRetry(model, apiKey, body, attempt + 1)
        }
        throw new ServerError(res.status)
      }
      throw new GeminiError(
        `Unexpected response ${res.status}: ${await res.text()}`,
        res.status,
      )
  }
}

// ── Response parsing ───────────────────────────────────────────────────────

function parseResponse(data: Record<string, unknown>): GeminiResult {
  const candidates = data['candidates'] as
    | Array<{ content?: { parts?: Array<Record<string, unknown>> } }>
    | undefined

  if (!candidates || candidates.length === 0) {
    // Check for safety filter
    const feedback = data['promptFeedback'] as
      | { blockReason?: string }
      | undefined
    if (feedback?.blockReason) {
      throw new ContentFilterError(feedback.blockReason)
    }
    return { image: null, text: null }
  }

  const parts = candidates[0]?.content?.parts
  if (!parts) return { image: null, text: null }

  const result: GeminiResult = { image: null, text: null }

  for (const part of parts) {
    if (typeof part['text'] === 'string') {
      result.text = part['text'] as string
    }
    const inline = part['inlineData'] as
      | { data?: string }
      | undefined
    if (inline?.data) {
      result.image = inline.data
    }
  }

  return result
}
