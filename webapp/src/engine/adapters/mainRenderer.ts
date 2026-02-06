import type { RenderInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function renderMain(input: RenderInput): Promise<NodeResult> {
  await delay(2000)
  return {
    image: input.image,
    resolution: input.resolution,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}
