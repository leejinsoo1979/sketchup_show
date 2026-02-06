import { create } from 'zustand'

interface ExecutionState {
  isRunning: boolean
  currentNodeId: string | null
  queue: string[]
  error: string | null

  setRunning: (running: boolean) => void
  setCurrentNodeId: (nodeId: string | null) => void
  setQueue: (queue: string[]) => void
  setError: (error: string | null) => void
  reset: () => void
}

export const useExecutionStore = create<ExecutionState>((set) => ({
  isRunning: false,
  currentNodeId: null,
  queue: [],
  error: null,

  setRunning: (isRunning) => set({ isRunning }),
  setCurrentNodeId: (currentNodeId) => set({ currentNodeId }),
  setQueue: (queue) => set({ queue }),
  setError: (error) => set({ error }),
  reset: () => set({ isRunning: false, currentNodeId: null, queue: [], error: null }),
}))
