import { useCallback } from 'react'

export interface MenuItem {
  label: string
  action: () => void
  danger?: boolean
}

interface ContextMenuProps {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const handleClick = useCallback(
    (action: () => void) => {
      action()
      onClose()
    },
    [onClose],
  )

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }} />
      {/* Menu */}
      <div
        className="fixed z-50 rounded-lg py-1"
        style={{
          left: x,
          top: y,
          backgroundColor: '#1e1e2a',
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
          minWidth: 180,
          borderRadius: 8,
        }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            className="block w-full px-4 py-2 text-left text-sm transition-colors duration-100"
            style={{
              color: item.danger ? '#ff4444' : '#cccccc',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a36')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            onClick={() => handleClick(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
