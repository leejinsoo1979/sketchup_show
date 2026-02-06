import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type OnConnect,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FolderOpen, ImageIcon } from 'lucide-react'

export function NodeCanvas() {
  const nodes: never[] = []
  const edges: never[] = []

  const onNodesChange: OnNodesChange = useCallback(() => {}, [])
  const onEdgesChange: OnEdgesChange = useCallback(() => {}, [])
  const onConnect: OnConnect = useCallback(() => {}, [])

  const isEmpty = nodes.length === 0

  return (
    <div className="relative flex-1" style={{ backgroundColor: '#111118' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ backgroundColor: '#111118' }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#1a1a24"
        />
      </ReactFlow>

      {/* Empty state overlay */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto flex flex-col items-center gap-3">
            <div
              className="flex items-center justify-center rounded-lg"
              style={{
                width: 80,
                height: 80,
                border: '2px dashed #555555',
              }}
            >
              <ImageIcon size={32} style={{ color: '#555555' }} />
            </div>
            <p style={{ color: '#888888', fontSize: 14 }}>
              Drag and drop an image to get started, or
            </p>
            <button
              className="flex items-center gap-2 rounded-md px-5 py-2 text-sm font-medium transition-colors duration-150"
              style={{
                backgroundColor: '#00c9a7',
                color: '#ffffff',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = '#00ddb8')
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = '#00c9a7')
              }
            >
              <FolderOpen size={14} />
              Browse
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
