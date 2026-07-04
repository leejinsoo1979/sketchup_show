import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

/**
 * 전체화면 이미지 확대 보기 (실물 Lumanova의 Enlarge).
 * 휠 = 줌, 드래그 = 이동, 더블클릭 = 리셋, ESC/X = 닫기
 */
export function ImageLightbox({ image, onClose }: { image: string; onClose: () => void }) {
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setZoom((z) => Math.min(6, Math.max(0.2, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
  }, [])

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y }
    },
    [pan],
  )

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const d = dragRef.current
    if (!d) return
    setPan({ x: d.panX + (e.clientX - d.startX), y: d.panY + (e.clientY - d.startY) })
  }, [])

  const endDrag = useCallback(() => {
    dragRef.current = null
  }, [])

  const reset = useCallback(() => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 200, backgroundColor: 'rgba(5, 5, 12, 0.95)' }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
      onDoubleClick={reset}
    >
      <img
        src={image}
        alt=""
        draggable={false}
        style={{
          maxWidth: '92vw',
          maxHeight: '92vh',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: 'center center',
          cursor: dragRef.current ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      />

      {/* 줌 표시 */}
      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded px-3 py-1"
        style={{ backgroundColor: '#1a1a24', color: '#cccccc', fontSize: 12 }}
      >
        {Math.round(zoom * 100)}% — 휠: 줌 · 드래그: 이동 · 더블클릭: 원래대로 · ESC: 닫기
      </div>

      {/* 닫기 */}
      <button
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: '#1a1a24', color: '#ffffff' }}
        onClick={onClose}
      >
        <X size={18} />
      </button>
    </div>
  )
}
