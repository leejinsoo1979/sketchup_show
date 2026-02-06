import { create } from 'zustand'
import type { NodeData } from '../types/node'
import type { UpscaleParams, VideoParams } from '../types/node'

interface CreditState {
  balance: number

  deduct: (amount: number) => void
  estimateCost: (nodes: NodeData[]) => number
}

function nodeCost(node: NodeData): number {
  switch (node.type) {
    case 'SOURCE':
    case 'COMPARE':
      return 0
    case 'RENDER':
    case 'MODIFIER':
      return 1
    case 'UPSCALE': {
      const params = node.params as UpscaleParams
      return params.scale === 4 ? 4 : 2
    }
    case 'VIDEO': {
      const params = node.params as VideoParams
      return params.duration === 10 ? 10 : 5
    }
  }
}

export const useCreditStore = create<CreditState>((set) => ({
  balance: 100,

  deduct: (amount) =>
    set((s) => ({ balance: Math.max(0, s.balance - amount) })),

  estimateCost: (nodes) =>
    nodes
      .filter((n) => n.status !== 'done')
      .reduce((sum, n) => sum + nodeCost(n), 0),
}))
