import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { NodeStatus, SourceParams } from '../../types/node'

type SourceNodeData = {
  status: NodeStatus
  params: SourceParams
  resultImage: string | null
}

type SourceNodeType = Node<SourceNodeData, 'SOURCE'>

export const SourceNode = memo(function SourceNode({ data, selected }: NodeProps<SourceNodeType>) {
  const thumbnail = data.resultImage ?? data.params.image ?? null

  return (
    <BaseNode
      selected={selected}
      status={data.status}
      thumbnail={thumbnail}
      label1="Source"
      hasInput={false}
      hasOutput={true}
      outputPortName="image"
    />
  )
})
