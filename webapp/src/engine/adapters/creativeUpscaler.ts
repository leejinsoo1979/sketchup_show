import type { UpscaleInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function upscaleCreative(input: UpscaleInput): Promise<NodeResult> {
  await delay(3000)
  return {
    image: input.image,
    resolution: `${input.scale}x upscaled`,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}
