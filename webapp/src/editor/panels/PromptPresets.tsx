import { useCallback, useState, type ReactNode } from 'react'
import { ClipboardList, ChevronUp, ChevronDown } from 'lucide-react'
import {
  Snowflake, Leaf, Sun, Moon, Users, Car, Flower2, Sprout, TreePine,
  Search, Link,
} from 'lucide-react'
import type { NodeData } from '../../types/node'
import type { PromptPreset } from '../../types/preset'
import { getPresetsForNodeType } from '../../presets'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import {
  ScreenToRenderIcon,
  ImageToSketchIcon,
  TopViewIcon,
  SideViewIcon,
  AnotherViewIcon,
  EnhanceRealismIcon,
  MakeBrighterIcon,
  AxonometryIcon,
  TechnicalDrawingsIcon,
  LogoIcon,
  AddBlurredPeopleIcon,
  AddBlurredCarsIcon,
  ZoomInVideoIcon,
  MoveForwardIcon,
  OrbitIcon,
  PanLeftIcon,
  UpscaleIcon,
} from './PresetIcons'

// Map custom SVG icons by preset id
function getPresetIcon(presetId: string, size: number): ReactNode {
  const cls = ''
  const style = { width: size, height: size }

  switch (presetId) {
    // Render
    case 'screen-to-render':
      return <ScreenToRenderIcon className={cls} {...style} />
    case 'image-to-sketch':
      return <ImageToSketchIcon className={cls} {...style} />
    case 'top-view':
      return <TopViewIcon className={cls} {...style} />
    case 'side-view':
      return <SideViewIcon className={cls} {...style} />
    case 'another-view':
      return <AnotherViewIcon className={cls} {...style} />

    // Modifier - custom SVGs
    case 'enhance-realism':
      return <EnhanceRealismIcon className={cls} {...style} />
    case 'volumetric-rays':
      return <Sun size={size} />
    case 'make-brighter':
      return <MakeBrighterIcon className={cls} {...style} />
    case 'closeup':
      return <Search size={size} />
    case 'axonometry':
      return <AxonometryIcon className={cls} {...style} />
    case 'winter':
      return <Snowflake size={size} />
    case 'autumn':
      return <Leaf size={size} />
    case 'technical-drawings':
      return <TechnicalDrawingsIcon className={cls} {...style} />
    case 'logo':
      return <LogoIcon className={cls} {...style} />
    case 'day-to-night':
      return <Sun size={size * 0.6} style={{ display: 'inline', marginRight: 2 }} />
    case 'night-to-day':
      return <Moon size={size * 0.6} style={{ display: 'inline', marginRight: 2 }} />
    case 'add-people':
      return <Users size={size} />
    case 'add-blurred-people':
      return <AddBlurredPeopleIcon className={cls} {...style} />
    case 'add-blurred-cars':
      return <AddBlurredCarsIcon className={cls} {...style} />
    case 'add-cars':
      return <Car size={size} />
    case 'add-flowers':
      return <Flower2 size={size} />
    case 'add-grass':
      return <Sprout size={size} />
    case 'add-trees':
      return <TreePine size={size} />

    // Upscale
    case 'upscale':
      return <UpscaleIcon className={cls} {...style} />

    // Video
    case 'zoom-in-video':
      return <ZoomInVideoIcon className={cls} {...style} />
    case 'move-forward':
      return <MoveForwardIcon className={cls} {...style} />
    case 'orbit':
      return <OrbitIcon className={cls} {...style} />
    case 'pan-left':
      return <PanLeftIcon className={cls} {...style} />

    default:
      return <Link size={size} />
  }
}

interface PromptPresetsProps {
  selectedNode: NodeData | null
}

function PresetCard({
  preset,
  isSelected,
  onClick,
}: {
  preset: PromptPreset
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      className="flex flex-col items-center justify-center gap-1.5 rounded-lg p-2 transition-colors duration-150"
      style={{
        backgroundColor: '#1e1e2a',
        border: isSelected ? '1px solid #00c9a7' : '1px solid transparent',
        color: '#aaaaaa',
        minHeight: 80,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = '#2a2a36'
        e.currentTarget.style.color = '#ffffff'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = '#1e1e2a'
        e.currentTarget.style.color = isSelected ? '#ffffff' : '#aaaaaa'
      }}
      onClick={onClick}
    >
      <div style={{ width: 40, height: 40 }} className="flex items-center justify-center">
        {getPresetIcon(preset.id, 32)}
      </div>
      <span
        className="w-full truncate text-center"
        style={{ fontSize: 11, color: '#cccccc' }}
      >
        {preset.name}
      </span>
    </button>
  )
}

export function PromptPresets({ selectedNode }: PromptPresetsProps) {
  const [collapsed, setCollapsed] = useState(false)
  const setPromptText = useUIStore((s) => s.setPromptText)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)

  const presets = selectedNode ? getPresetsForNodeType(selectedNode.type) : []

  const handlePresetClick = useCallback(
    (preset: PromptPreset) => {
      if (!selectedNode) return

      setSelectedPresetId(preset.id)
      // Fill prompt bar
      setPromptText(preset.basePrompt)
      // Update node params with preset prompt and presetId
      if ('prompt' in selectedNode.params) {
        updateNodeParams(selectedNode.id, {
          prompt: preset.basePrompt,
          presetId: preset.id,
        })
      }
    },
    [selectedNode, setPromptText, updateNodeParams],
  )

  const CollapseIcon = collapsed ? ChevronDown : ChevronUp

  if (!selectedNode || selectedNode.type === 'SOURCE' || selectedNode.type === 'COMPARE') {
    return (
      <div>
        <div className="flex items-center gap-2 px-4" style={{ height: 40 }}>
          <ClipboardList size={16} style={{ color: '#888888' }} />
          <span className="flex-1 text-sm" style={{ color: '#ffffff', fontWeight: 500 }}>
            Prompt Presets
          </span>
          <ChevronUp size={16} style={{ color: '#888888' }} />
        </div>
        <div className="px-4 pb-3" style={{ color: '#555555', fontSize: 12 }}>
          {selectedNode ? 'Not applicable for this node' : 'Select a node to see presets'}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        className="flex w-full items-center gap-2 px-4"
        style={{ height: 40 }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <ClipboardList size={16} style={{ color: '#888888' }} />
        <span className="flex-1 text-left text-sm" style={{ color: '#ffffff', fontWeight: 500 }}>
          Prompt Presets
        </span>
        <CollapseIcon size={16} style={{ color: '#888888' }} />
      </button>

      {!collapsed && (
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          {presets.map((preset) => (
            <PresetCard
              key={preset.id}
              preset={preset}
              isSelected={selectedPresetId === preset.id}
              onClick={() => handlePresetClick(preset)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
