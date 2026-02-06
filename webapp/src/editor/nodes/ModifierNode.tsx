import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { NodeStatus, ModifierParams } from '../../types/node'

type ModifierNodeData = {
  status: NodeStatus
  params: ModifierParams
  resultImage: string | null
}

type ModifierNodeType = Node<ModifierNodeData, 'MODIFIER'>

export const ModifierNode = memo(function ModifierNode({ data, selected }: NodeProps<ModifierNodeType>) {
  const prompt = data.params.prompt || ''
  const label2 = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt

  return (
    <BaseNode
      selected={selected}
      status={data.status}
      thumbnail={data.resultImage}
      label1="2. Details editor"
      label2={label2 || undefined}
      hasInput={true}
      hasOutput={true}
    />
  )
})
