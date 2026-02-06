import { create } from 'zustand'
import type { NodeData } from '../types/node'
import type { EdgeData } from '../types/graph'

const MAX_UNDO = 50

interface UndoEntry {
  nodes: NodeData[]
  edges: EdgeData[]
  selectedNodeId: string | null
}

interface UndoState {
  undoStack: UndoEntry[]
  redoStack: UndoEntry[]

  pushUndo: (entry: UndoEntry) => void
  undo: (currentState: UndoEntry) => UndoEntry | null
  redo: (currentState: UndoEntry) => UndoEntry | null
  clearStacks: () => void
}

export const useUndoStore = create<UndoState>((set, get) => ({
  undoStack: [],
  redoStack: [],

  pushUndo: (entry) => {
    set((s) => ({
      undoStack: [...s.undoStack.slice(-(MAX_UNDO - 1)), entry],
      redoStack: [],
    }))
  },

  undo: (currentState) => {
    const { undoStack } = get()
    if (undoStack.length === 0) return null
    const entry = undoStack[undoStack.length - 1]
    set((s) => ({
      undoStack: s.undoStack.slice(0, -1),
      redoStack: [...s.redoStack, currentState],
    }))
    return entry
  },

  redo: (currentState) => {
    const { redoStack } = get()
    if (redoStack.length === 0) return null
    const entry = redoStack[redoStack.length - 1]
    set((s) => ({
      redoStack: s.redoStack.slice(0, -1),
      undoStack: [...s.undoStack, currentState],
    }))
    return entry
  },

  clearStacks: () => set({ undoStack: [], redoStack: [] }),
}))
