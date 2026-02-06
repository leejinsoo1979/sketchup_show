import { X } from 'lucide-react'
import { useUIStore } from '../../state/uiStore'

export function PromptBar() {
  const promptText = useUIStore((s) => s.promptText)
  const setPromptText = useUIStore((s) => s.setPromptText)

  return (
    <div className="relative flex flex-1 items-center px-3">
      <input
        type="text"
        value={promptText}
        onChange={(e) => setPromptText(e.target.value)}
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
          onClick={() => setPromptText('')}
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
