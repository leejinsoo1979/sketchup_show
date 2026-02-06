import { create } from 'zustand'

export type SidebarItem = 'render' | 'history' | 'account' | 'tutorial' | 'support' | 'settings'
export type InspectorTab = 'preview' | 'compare' | 'draw'

interface UIState {
  activeSidebarItem: SidebarItem
  activeTab: InspectorTab
  zoom: number
  pan: { x: number; y: number }
  promptText: string

  setActiveSidebarItem: (item: SidebarItem) => void
  setActiveTab: (tab: InspectorTab) => void
  setZoom: (zoom: number) => void
  setPan: (pan: { x: number; y: number }) => void
  setPromptText: (text: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeSidebarItem: 'render',
  activeTab: 'preview',
  zoom: 1.0,
  pan: { x: 0, y: 0 },
  promptText: '',

  setActiveSidebarItem: (item) => set({ activeSidebarItem: item }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setZoom: (zoom) => set({ zoom }),
  setPan: (pan) => set({ pan }),
  setPromptText: (text) => set({ promptText: text }),
}))
