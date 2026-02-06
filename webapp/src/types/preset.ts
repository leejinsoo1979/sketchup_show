import type { NodeType } from './node'

export type PresetCategory = 'render' | 'modifier' | 'upscale' | 'video'

export type MergeMode = 'replace' | 'append'

export interface PromptPreset {
  id: string
  name: string
  icon: string
  category: PresetCategory
  applicableNodeTypes: NodeType[]
  basePrompt: string
  negativePrompt: string
  visualConstraints: string
  forbiddenChanges: string
  mergeMode: MergeMode
}
