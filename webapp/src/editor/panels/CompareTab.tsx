import { useCallback, useRef, useState } from 'react'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'

export function CompareTab() {
  const compareANodeId = useUIStore((s) => s.compareANodeId)
  const compareBNodeId = useUIStore((s) => s.compareBNodeId)
  const nodes = useGraphStore((s) => s.nodes)

  const nodeA = compareANodeId ? nodes.find((n) => n.id === compareANodeId) : null
  const nodeB = compareBNodeId ? nodes.find((n) => n.id === compareBNodeId) : null
  const imageA = nodeA?.result?.image ?? null
  const imageB = nodeB?.result?.image ?? null

  const containerRef = useRef<HTMLDivElement>(null)
  const [sliderX, setSliderX] = useState(0.5)
  const isDraggingRef = useRef(false)

  const handleMouseDown = useCallback(() => {
    isDraggingRef.current = true
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    setSliderX(Math.max(0, Math.min(1, x)))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  if (!imageA && !imageB) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2"
        style={{ minHeight: 200, color: '#555555', fontSize: 13 }}
      >
        <span>Assign images with node right-click</span>
        <span style={{ fontSize: 11, color: '#444444' }}>
          Compare A / Compare B
        </span>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="relative select-none"
      style={{
        minHeight: 200,
        backgroundColor: '#111118',
        cursor: 'col-resize',
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Image B (full width, behind) */}
      {imageB ? (
        <img
          src={imageB}
          alt="Compare B"
          className="block w-full"
          style={{ objectFit: 'contain' }}
          draggable={false}
        />
      ) : (
        <div
          className="flex w-full items-center justify-center"
          style={{ height: 200, color: '#444444', fontSize: 12 }}
        >
          B: Not assigned
        </div>
      )}

      {/* Image A (clipped by slider position) */}
      {imageA && (
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ width: `${sliderX * 100}%` }}
        >
          <img
            src={imageA}
            alt="Compare A"
            className="block"
            style={{
              width: containerRef.current?.clientWidth ?? '100%',
              objectFit: 'contain',
            }}
            draggable={false}
          />
        </div>
      )}

      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0"
        style={{
          left: `${sliderX * 100}%`,
          width: 2,
          backgroundColor: '#ffffff',
          transform: 'translateX(-1px)',
          pointerEvents: 'none',
        }}
      />

      {/* Slider handle */}
      <div
        className="absolute top-1/2 z-10 flex items-center justify-center rounded-full"
        style={{
          left: `${sliderX * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 24,
          height: 24,
          backgroundColor: '#ffffff',
          cursor: 'col-resize',
          boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        }}
        onMouseDown={handleMouseDown}
      >
        <div className="flex gap-0.5">
          <div style={{ width: 2, height: 10, backgroundColor: '#333333', borderRadius: 1 }} />
          <div style={{ width: 2, height: 10, backgroundColor: '#333333', borderRadius: 1 }} />
        </div>
      </div>

      {/* Labels */}
      <div
        className="absolute left-2 top-2 rounded px-1.5 py-0.5"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#ffffff', fontSize: 10 }}
      >
        A
      </div>
      <div
        className="absolute right-2 top-2 rounded px-1.5 py-0.5"
        style={{ backgroundColor: 'rgba(0,0,0,0.6)', color: '#ffffff', fontSize: 10 }}
      >
        B
      </div>
    </div>
  )
}
