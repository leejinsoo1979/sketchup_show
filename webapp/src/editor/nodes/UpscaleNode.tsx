import { memo } from 'react'
import type { NodeProps, Node } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import type { NodeStatus, UpscaleParams } from '../../types/node'

type UpscaleNodeData = {
  status: NodeStatus
  params: UpscaleParams
  resultImage: string | null
}

type UpscaleNodeType = Node<UpscaleNodeData, 'UPSCALE'>

export const UpscaleNode = memo(function UpscaleNode({ data, selected }: NodeProps<UpscaleNodeType>) {
  const prompt = data.params.prompt || 'Upscale'
  const label2 = prompt.length > 40 ? prompt.slice(0, 40) + '...' : prompt

  return (
    <BaseNode
      selected={selected}
      status={data.status}
      thumbnail={data.resultImage}
      label1="3. Creative upscaler"
      label2={label2}
      hasInput={true}
      hasOutput={true}
    />
  )
})
