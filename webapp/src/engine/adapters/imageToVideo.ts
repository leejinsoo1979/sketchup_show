import type { VideoInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function generateVideo(input: VideoInput): Promise<NodeResult> {
  await delay(5000)
  return {
    image: input.image,
    video: 'mock-video-url',
    timestamp: new Date().toISOString(),
    cacheKey: '',
  }
}
