import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type { GraphSnapshot } from '../types/graph'
import type { NodeData } from '../types/node'
import type { EdgeData } from '../types/graph'

interface HistoryState {
  snapshots: GraphSnapshot[]

  saveSnapshot: (nodes: NodeData[], edges: EdgeData[], creditUsed: number) => void
  restoreSnapshot: (snapshotId: string) => GraphSnapshot | undefined
  loadMore: () => void
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  snapshots: [],

  saveSnapshot: (nodes, edges, creditUsed) => {
    const thumbnails = nodes
      .filter((n) => n.result?.image)
      .map((n) => n.result!.image!)

    const snapshot: GraphSnapshot = {
      id: uuid(),
      graph: {
        graphId: uuid(),
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        meta: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          source: 'web',
          appVersion: '1.0.0',
        },
        ui: { zoom: 1.0, pan: { x: 0, y: 0 } },
      },
      timestamp: new Date().toISOString(),
      creditUsed,
      thumbnails,
    }

    set((s) => ({ snapshots: [snapshot, ...s.snapshots] }))
  },

  restoreSnapshot: (snapshotId) => {
    return get().snapshots.find((s) => s.id === snapshotId)
  },

  loadMore: () => {
    // Placeholder for pagination
  },
}))
