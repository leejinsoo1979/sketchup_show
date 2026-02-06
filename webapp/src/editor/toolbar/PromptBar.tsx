import { useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'

export function PromptBar() {
  const promptText = useUIStore((s) => s.promptText)
  const setPromptText = useUIStore((s) => s.setPromptText)

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  const hasPrompt =
    selectedNode !== null && 'prompt' in selectedNode.params

  const nodePrompt = hasPrompt
    ? (selectedNode!.params as { prompt: string }).prompt
    : null

  // Sync: node selection → fill prompt bar
  const prevNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedNodeId !== prevNodeIdRef.current) {
      prevNodeIdRef.current = selectedNodeId
      if (nodePrompt !== null) {
        setPromptText(nodePrompt)
      }
    }
  }, [selectedNodeId, nodePrompt, setPromptText])

  // Debounced node param update (avoid undo-stack flooding)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncToNode = useCallback(
    (value: string) => {
      if (!selectedNodeId || !hasPrompt) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateNodeParams(selectedNodeId, { prompt: value })
      }, 400)
    },
    [selectedNodeId, hasPrompt, updateNodeParams],
  )

  // Flush pending debounce on unmount or node change
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [selectedNodeId])

  const handleChange = (value: string) => {
    setPromptText(value)
    syncToNode(value)
  }

  const handleClear = () => {
    setPromptText('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (selectedNodeId && hasPrompt) {
      updateNodeParams(selectedNodeId, { prompt: '' })
    }
  }

  return (
    <div className="relative flex flex-1 items-center px-3">
      <input
        type="text"
        value={promptText}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter your image prompt here..."
        className="h-9 w-full rounded-md px-3 pr-8 text-sm outline-none"
        style={{
          backgroundColor: '#111118',
          border: '1px solid #333340',
          color: '#ffffff',
          fontSize: 14,
        }}
      />
      {promptText && (
        <button
          onClick={handleClear}
          className="absolute right-5 flex items-center justify-center transition-colors duration-150"
          style={{ color: '#666666' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#666666')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
