import { Maximize2 } from 'lucide-react'
import { useUIStore, type InspectorTab } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { PreviewTab } from './PreviewTab'
import { RenderSettings } from './RenderSettings'
import { PromptPresets } from './PromptPresets'

const tabs: { id: InspectorTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'compare', label: 'Compare' },
  { id: 'draw', label: 'Draw' },
]

export function InspectorPanel() {
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  return (
    <aside
      className="flex h-full flex-col overflow-y-auto"
      style={{
        width: 320,
        minWidth: 320,
        backgroundColor: '#1a1a24',
        borderLeft: '1px solid #222233',
      }}
    >
      {/* Enlarge Button */}
      <div
        className="flex items-center justify-end px-3"
        style={{ height: 36 }}
      >
        <button
          className="flex items-center gap-1.5 transition-colors duration-150"
          style={{ color: '#888888', fontSize: 12 }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#888888')}
        >
          <Maximize2 size={14} />
          Enlarge
        </button>
      </div>

      {/* Tab Bar */}
      <div
        className="flex gap-6 px-4"
        style={{
          height: 40,
          borderBottom: '1px solid #222233',
        }}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="relative pb-2 text-sm transition-colors duration-150"
              style={{
                color: isActive ? '#ffffff' : '#666666',
                fontWeight: isActive ? 500 : 400,
              }}
            >
              {tab.label}
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 right-0"
                  style={{ height: 2, backgroundColor: '#ffffff' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{ borderBottom: '1px solid #222233' }}>
        {activeTab === 'preview' && (
          <PreviewTab selectedNode={selectedNode} />
        )}
        {activeTab === 'compare' && (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: 200, color: '#555555', fontSize: 13 }}
          >
            Assign images with Compare A / Compare B
          </div>
        )}
        {activeTab === 'draw' && (
          <div
            className="flex items-center justify-center"
            style={{ minHeight: 200, color: '#555555', fontSize: 13 }}
          >
            {selectedNode ? 'Draw tab (coming soon)' : 'Select a node to start drawing'}
          </div>
        )}
      </div>

      {/* Render Settings Section */}
      <RenderSettings selectedNode={selectedNode} />

      {/* Prompt Presets Section */}
      <PromptPresets selectedNode={selectedNode} />
    </aside>
  )
}
