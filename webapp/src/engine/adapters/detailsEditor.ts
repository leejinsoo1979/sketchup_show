import type { ModifierInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function modifyDetails(input: ModifierInput): Promise<NodeResult> {
  await delay(2000)
  return {
    image: input.image,
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}
