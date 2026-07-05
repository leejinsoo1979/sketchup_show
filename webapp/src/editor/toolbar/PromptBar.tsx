import { useEffect, useRef, useCallback, useState } from 'react'
import { X, Sparkles, Square, RotateCw } from 'lucide-react'
import { useUIStore } from '../../state/uiStore'
import { useGraphStore } from '../../state/graphStore'
import { useExecutionStore } from '../../state/executionStore'
import { generateAutoPrompt, getUpstreamImage } from '../../engine/autoPrompt'
import type { RenderParams } from '../../types/node'

export function PromptBar() {
  const promptText = useUIStore((s) => s.promptText)
  const setPromptText = useUIStore((s) => s.setPromptText)

  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const nodes = useGraphStore((s) => s.nodes)
  const updateNodeParams = useGraphStore((s) => s.updateNodeParams)

  const selectedNode = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId) ?? null
    : null

  const hasPrompt =
    selectedNode !== null && 'prompt' in selectedNode.params

  const nodePrompt = hasPrompt
    ? (selectedNode!.params as { prompt: string }).prompt
    : null

  // Sync: node selection → fill prompt bar
  const prevNodeIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (selectedNodeId !== prevNodeIdRef.current) {
      prevNodeIdRef.current = selectedNodeId
      if (nodePrompt !== null) {
        setPromptText(nodePrompt)
      }
    }
  }, [selectedNodeId, nodePrompt, setPromptText])

  // Debounced node param update (avoid undo-stack flooding)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const syncToNode = useCallback(
    (value: string) => {
      if (!selectedNodeId || !hasPrompt) return
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        updateNodeParams(selectedNodeId, { prompt: value })
      }, 400)
    },
    [selectedNodeId, hasPrompt, updateNodeParams],
  )

  // Flush pending debounce on unmount or node change
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [selectedNodeId])

  const handleChange = (value: string) => {
    setPromptText(value)
    syncToNode(value)
  }

  const handleClear = () => {
    setPromptText('')
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (selectedNodeId && hasPrompt) {
      updateNodeParams(selectedNodeId, { prompt: '' })
    }
  }

  // ── Auto 프롬프트 (구 플러그인 핵심 기능 이식) ──
  const [autoLoading, setAutoLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const setExecError = useExecutionStore((s) => s.setError)

  const isRenderNode = selectedNode?.type === 'RENDER'
  const upstreamImage = isRenderNode && selectedNodeId ? getUpstreamImage(selectedNodeId) : null
  const autoEnabled = isRenderNode && !!upstreamImage

  const handleAuto = async () => {
    // 생성 중이면 취소
    if (autoLoading) {
      abortRef.current?.abort()
      return
    }
    if (!selectedNodeId || !upstreamImage) return

    const params = selectedNode!.params as RenderParams
    const controller = new AbortController()
    abortRef.current = controller
    setAutoLoading(true)
    setExecError(null)

    // 안전장치: 120초 안에 끝나지 않으면 강제 취소 (무한 로딩 방지)
    const watchdog = setTimeout(() => controller.abort(), 120_000)

    try {
      const result = await generateAutoPrompt({
        image: upstreamImage,
        style: params.prompt !== 'Create photorealistic image' ? params.prompt : '',
        timePreset: params.timePreset ?? 'day',
        lightsOn: params.lightsOn ?? true,
        signal: controller.signal,
      })
      setPromptText(result.prompt)
      updateNodeParams(selectedNodeId, {
        prompt: result.prompt,
        negativePrompt: result.negativePrompt,
      })
    } catch (err) {
      if (!controller.signal.aborted) {
        setExecError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      clearTimeout(watchdog)
      setAutoLoading(false)
      abortRef.current = null
    }
  }

  return (
    <div
      className="relative flex min-w-0 flex-1 items-center"
      style={{
        maxWidth: 1040,
        height: 54,
        gap: 8,
        padding: 5,
        borderRadius: 16,
        background: 'linear-gradient(180deg, rgba(25,25,34,.96), rgba(16,16,24,.96))',
        border: '1px solid rgba(255,255,255,.08)',
        boxShadow: '0 18px 48px rgba(0,0,0,.32), inset 0 1px 0 rgba(255,255,255,.05)',
      }}
    >
      {/* Auto 프롬프트 생성 (생성 중 클릭 = 취소) */}
      <button
        onClick={handleAuto}
        disabled={!autoEnabled && !autoLoading}
        title={
          autoLoading
            ? '생성 취소'
            : autoEnabled
              ? 'AI가 씬을 분석해 프롬프트와 네거티브를 자동 생성'
              : 'Render 노드를 선택하고 Source와 연결하세요'
        }
        className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 transition-colors"
        style={{
          height: 42,
          minWidth: 74,
          background: autoLoading
            ? 'rgba(255,68,102,.18)'
            : autoEnabled
              ? 'rgba(0,201,167,.14)'
              : 'rgba(255,255,255,.035)',
          border: autoLoading
            ? '1px solid rgba(255,68,102,.42)'
            : autoEnabled
              ? '1px solid rgba(0,201,167,.34)'
              : '1px solid rgba(255,255,255,.06)',
          color: autoLoading ? '#ff8da3' : autoEnabled ? '#7ff5e3' : '#595967',
          fontSize: 12.5,
          fontWeight: 780,
          cursor: autoEnabled || autoLoading ? 'pointer' : 'not-allowed',
        }}
      >
        {autoLoading ? (
          <>
            <Square size={12} fill="currentColor" />
            Cancel
          </>
        ) : (
          <>
            <Sparkles size={14} />
            Auto
          </>
        )}
      </button>
      <input
        type="text"
        value={promptText}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Enter your image prompt here..."
        className="h-full min-w-0 flex-1 rounded-xl px-4 pr-16 outline-none"
        style={{
          backgroundColor: '#0d0d14',
          border: '1px solid rgba(0,201,167,.46)',
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.025), 0 0 0 3px rgba(0,201,167,.08)',
          color: '#f5f5fa',
          fontSize: 13.5,
          fontWeight: 500,
        }}
      />
      {promptText && (
        <button
          onClick={handleClear}
          className="absolute flex items-center justify-center rounded-full transition-colors duration-150"
          style={{ right: 47, width: 24, height: 24, color: '#777784', background: 'rgba(255,255,255,.04)' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#777784')}
        >
          <X size={14} />
        </button>
      )}
      {/* 실물 Lumanova: 입력 우측 재생성 아이콘 (프롬프트 다시 실행) */}
      <button
        title="다시 생성 (Make)"
        onClick={() => document.querySelector<HTMLButtonElement>('[data-make-button]')?.click()}
        className="absolute right-3 flex items-center justify-center rounded-full transition-colors"
        style={{ width: 30, height: 30, background: '#1d1d28', border: '1px solid #363644', color: '#bfc0cb' }}
      >
        <RotateCw size={13} />
      </button>
    </div>
  )
}
