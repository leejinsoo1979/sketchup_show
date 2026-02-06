import type { ModifierInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { callGemini, useMock } from '../geminiClient'

// ── Mock (development) ─────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function modifyDetailsMock(input: ModifierInput): Promise<NodeResult> {
  await delay(2000)
  return {
    image: input.image,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Gemini (production) ────────────────────────────────────────────────────

async function modifyDetailsGemini(input: ModifierInput): Promise<NodeResult> {
  const sysInstruction =
    'You are an image detail editor. ' +
    'Apply the requested modification to the input image. ' +
    'Preserve overall composition and only change the areas described in the prompt.'

  const result = await callGemini({
    image: input.image,
    prompt: input.prompt,
    systemInstruction: sysInstruction,
  })

  const outputImage = result.image
    ? `data:image/png;base64,${result.image}`
    : input.image

  return {
    image: outputImage,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Exported switcher ──────────────────────────────────────────────────────

export async function modifyDetails(input: ModifierInput): Promise<NodeResult> {
  return useMock() ? modifyDetailsMock(input) : modifyDetailsGemini(input)
}
