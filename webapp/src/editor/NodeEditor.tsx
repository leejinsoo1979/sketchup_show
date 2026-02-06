import { useCallback, useMemo } from 'react'
import { LeftSidebar } from './sidebar/LeftSidebar'
import { NodeCanvas } from './canvas/NodeCanvas'
import { InspectorPanel } from './panels/InspectorPanel'
import { PromptBar } from './toolbar/PromptBar'
import { MakeButton } from './toolbar/MakeButton'
import { useGraphStore } from '../state/graphStore'
import { useExecutionStore } from '../state/executionStore'
import { useCreditStore } from '../state/creditStore'
import { executePipeline, estimatePipelineCost } from '../engine'

export function NodeEditor() {
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const executionError = useExecutionStore((s) => s.error)
  const balance = useCreditStore((s) => s.balance)

  // Estimate cost for the selected node's pipeline
  const estimatedCost = useMemo(() => {
    if (!selectedNodeId) return 0
    return estimatePipelineCost(selectedNodeId)
  }, [selectedNodeId, nodes])

  const insufficientCredits = estimatedCost > balance
  const noNodeSelected = !selectedNodeId
  const makeDisabled = isRunning || noNodeSelected || insufficientCredits

  const handleMake = useCallback(async () => {
    if (!selectedNodeId || isRunning) return
    await executePipeline(selectedNodeId)
  }, [selectedNodeId, isRunning])

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
            className="relative flex shrink-0 items-center"
            style={{
              height: 52,
              backgroundColor: '#1a1a24',
              borderTop: '1px solid #222233',
            }}
          >
            <PromptBar />
            <MakeButton
              credits={estimatedCost}
              disabled={makeDisabled}
              isRunning={isRunning}
              onClick={handleMake}
            />

            {/* Execution error display */}
            {executionError && (
              <div
                className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 rounded-md px-3 py-1.5 text-xs"
                style={{
                  backgroundColor: '#ff444433',
                  color: '#ff4444',
                  border: '1px solid #ff4444',
                }}
              >
                {executionError}
              </div>
            )}

            {/* Progress bar during execution */}
            {isRunning && (
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{ height: 2 }}
              >
                <div
                  className="h-full animate-pulse"
                  style={{
                    background: 'linear-gradient(90deg, #ff4466, #ff6688)',
                    width: '100%',
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
