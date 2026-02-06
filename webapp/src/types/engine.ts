import type { MaskLayer, NodeResult } from './node'

export interface EngineAdapter {
  id: string
  type: 'image' | 'video' | 'upscale'
  execute(input: EngineInput): Promise<NodeResult>
}

export interface RenderInput {
  engine: string
  image: string
  prompt: string
  systemPrompt: string
  negativePrompt: string
  seed: number | null
  resolution: string
}

export interface ModifierInput {
  image: string
  prompt: string
  systemPrompt: string
  negativePrompt: string
  mask: string | null
  maskLayers: MaskLayer[]
}

export interface UpscaleInput {
  image: string
  scale: number
  optimizedFor: string
  creativity: number
  detailStrength: number
  similarity: number
  promptStrength: number
  prompt: string
}

export interface VideoInput {
  engine: string
  image: string
  endFrame: string | null
  duration: number
  prompt: string
}

export type EngineInput = RenderInput | ModifierInput | UpscaleInput | VideoInput
