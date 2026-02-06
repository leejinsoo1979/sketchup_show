import { Maximize2, Monitor, ClipboardList, ChevronUp } from 'lucide-react'
import { useUIStore, type InspectorTab } from '../../state/uiStore'

const tabs: { id: InspectorTab; label: string }[] = [
  { id: 'preview', label: 'Preview' },
  { id: 'compare', label: 'Compare' },
  { id: 'draw', label: 'Draw' },
]

export function InspectorPanel() {
  const activeTab = useUIStore((s) => s.activeTab)
  const setActiveTab = useUIStore((s) => s.setActiveTab)

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

      {/* Preview Area */}
      <div
        className="flex items-center justify-center"
        style={{
          minHeight: 200,
          borderBottom: '1px solid #222233',
          color: '#555555',
          fontSize: 13,
        }}
      >
        {activeTab === 'preview' && (
          <span>No image selected</span>
        )}
        {activeTab === 'compare' && (
          <span>Assign images with Compare A / Compare B</span>
        )}
        {activeTab === 'draw' && (
          <span>Select a node to start drawing</span>
        )}
      </div>

      {/* Render Settings Section */}
      <div style={{ borderBottom: '1px solid #222233' }}>
        <div
          className="flex items-center gap-2 px-4"
          style={{ height: 40 }}
        >
          <Monitor size={16} style={{ color: '#888888' }} />
          <span
            className="flex-1 text-sm"
            style={{ color: '#ffffff', fontWeight: 500 }}
          >
            Render settings
          </span>
          <ChevronUp size={16} style={{ color: '#888888' }} />
        </div>
        <div
          className="px-4 pb-3"
          style={{ color: '#555555', fontSize: 12 }}
        >
          Select a node to configure
        </div>
      </div>

      {/* Prompt Presets Section */}
      <div>
        <div
          className="flex items-center gap-2 px-4"
          style={{ height: 40 }}
        >
          <ClipboardList size={16} style={{ color: '#888888' }} />
          <span
            className="flex-1 text-sm"
            style={{ color: '#ffffff', fontWeight: 500 }}
          >
            Prompt Presets
          </span>
          <ChevronUp size={16} style={{ color: '#888888' }} />
        </div>
        <div
          className="px-4 pb-3"
          style={{ color: '#555555', fontSize: 12 }}
        >
          Select a node to see presets
        </div>
      </div>
    </aside>
  )
}
