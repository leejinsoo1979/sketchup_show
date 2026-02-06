import { LeftSidebar } from './sidebar/LeftSidebar'
import { NodeCanvas } from './canvas/NodeCanvas'
import { InspectorPanel } from './panels/InspectorPanel'
import { PromptBar } from './toolbar/PromptBar'
import { MakeButton } from './toolbar/MakeButton'

export function NodeEditor() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Title Bar */}
      <div
        className="flex shrink-0 items-center px-4"
        style={{
          height: 28,
          backgroundColor: '#0a0a14',
          borderBottom: '1px solid #222233',
        }}
      >
        <span style={{ color: '#888888', fontSize: 12 }}>
          VizMaker
        </span>
        <span style={{ color: '#444444', fontSize: 12, margin: '0 8px' }}>|</span>
        <span style={{ color: '#888888', fontSize: 12 }}>
          Server connection:{' '}
          <span style={{ color: '#00c9a7' }}>Connected</span>
        </span>
      </div>

      {/* Main Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <LeftSidebar />

        {/* Center + Right */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Canvas + Inspector */}
          <div className="flex flex-1 overflow-hidden">
            <NodeCanvas />
            <InspectorPanel />
          </div>

          {/* Bottom Prompt Bar */}
          <div
            className="flex shrink-0 items-center"
            style={{
              height: 52,
              backgroundColor: '#1a1a24',
              borderTop: '1px solid #222233',
            }}
          >
            <PromptBar />
            <MakeButton credits={1} disabled={false} onClick={() => {}} />
          </div>
        </div>
      </div>
    </div>
  )
}
