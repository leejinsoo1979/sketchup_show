import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { NodeStatus, CompareParams } from '../../types/node'

type CompareNodeData = {
  status: NodeStatus
  params: CompareParams
  resultImage: string | null
}

type CompareNodeType = Node<CompareNodeData, 'COMPARE'>

export const CompareNode = memo(function CompareNode({ data, selected }: NodeProps<CompareNodeType>) {
  const modeLabel = data.params.mode === 'slider' ? 'Slider' : 'Side by side'

  return (
    <BaseNode
      selected={selected}
      status={data.status}
      thumbnail={data.resultImage}
      label1="Compare"
      label2={modeLabel}
      hasInput={true}
      hasOutput={false}
      inputPortName="imageA"
      secondInputPortName="imageB"
    />
  )
})
