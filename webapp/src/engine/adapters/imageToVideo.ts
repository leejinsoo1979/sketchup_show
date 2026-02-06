import type { VideoInput } from '../../types/engine'
import type { NodeResult } from '../../types/node'

// Video generation uses dedicated video APIs (Kling, Seedance) rather than
// Gemini image generation. The real implementation will call those services
// once their adapters are ready. For now, all paths return the mock.

// ── Mock ───────────────────────────────────────────────────────────────────

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
