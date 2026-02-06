import type { RenderInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { callGemini, useMock } from '../geminiClient'

// ── Mock (development) ─────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function renderMainMock(input: RenderInput): Promise<NodeResult> {
  await delay(2000)
  return {
    image: input.image,
    resolution: input.resolution,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Gemini (production) ────────────────────────────────────────────────────

async function renderMainGemini(input: RenderInput): Promise<NodeResult> {
  const result = await callGemini({
    image: input.image,
    prompt: input.prompt,
    engine: input.engine,
  })

  const outputImage = result.image
    ? `data:image/png;base64,${result.image}`
    : input.image

  return {
    image: outputImage,
    resolution: input.resolution,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Exported switcher ──────────────────────────────────────────────────────

export async function renderMain(input: RenderInput): Promise<NodeResult> {
  return useMock() ? renderMainMock(input) : renderMainGemini(input)
}
