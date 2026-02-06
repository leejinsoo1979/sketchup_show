import type { UpscaleInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'
import { callGemini, useMock } from '../geminiClient'

// ── Mock (development) ─────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function upscaleCreativeMock(input: UpscaleInput): Promise<NodeResult> {
  await delay(3000)
  return {
    image: input.image,
    resolution: `${input.scale}x upscaled`,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Gemini (production) ────────────────────────────────────────────────────

async function upscaleCreativeGemini(input: UpscaleInput): Promise<NodeResult> {
  const sysInstruction =
    'You are a creative image upscaler. ' +
    'Enhance the input image to a higher resolution while adding fine detail. ' +
    'Maintain the exact composition, colors, and layout of the original.'

  const prompt =
    `Upscale this image by ${input.scale}x. ` +
    `Optimization: ${input.optimizedFor}. ` +
    (input.prompt ? input.prompt : 'Enhance all details.')

  const result = await callGemini({
    image: input.image,
    prompt,
    systemInstruction: sysInstruction,
  })

  const outputImage = result.image
    ? `data:image/png;base64,${result.image}`
    : input.image

  return {
    image: outputImage,
    resolution: `${input.scale}x upscaled`,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}

// ── Exported switcher ──────────────────────────────────────────────────────

export async function upscaleCreative(input: UpscaleInput): Promise<NodeResult> {
  return useMock() ? upscaleCreativeMock(input) : upscaleCreativeGemini(input)
}
