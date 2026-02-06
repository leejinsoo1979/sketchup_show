import { useGraphStore } from '../state/graphStore'
import { useUIStore } from '../state/uiStore'
import type { SceneMeta } from '../types/node'

// ---------------------------------------------------------------------------
// Types matching SKETCHUP.md JSON payload
// ---------------------------------------------------------------------------

export interface SketchUpCameraMeta {
  eye: [number, number, number]
  target: [number, number, number]
  up: [number, number, number]
  fov: number
  perspective: boolean
  aspectRatio: number
}

export interface SketchUpSceneMeta {
  modelName: string
  sceneId: string | null
  style: string
  shadow: boolean
  shadowTime: string
}

export interface SketchUpRenderingMeta {
  edgeDisplay: number
  faceStyle: number
  backgroundColor: [number, number, number]
}

export interface SketchUpMeta {
  camera: SketchUpCameraMeta
  scene: SketchUpSceneMeta
  rendering: SketchUpRenderingMeta
}

export interface CapturePayload {
  source: 'sketchup'
  image: string // base64 (no data-URI prefix)
  meta: SketchUpMeta
  timestamp: string // ISO-8601
}

interface StatusResponse {
  connected: boolean
  version?: string
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BRIDGE_BASE_URL = 'http://localhost:9876'
const POLL_INTERVAL_MS = 3000
const REQUEST_TIMEOUT_MS = 2000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSceneMeta(meta: SketchUpMeta): SceneMeta {
  return {
    modelName: meta.scene.modelName,
    sceneId: meta.scene.sceneId ?? '',
    fov: meta.camera.fov,
    eye: meta.camera.eye,
    target: meta.camera.target,
    up: meta.camera.up,
    shadow: meta.scene.shadow,
    style: meta.scene.style,
  }
}

function toDataUri(base64: string): string {
  if (base64.startsWith('data:')) return base64
  return `data:image/png;base64,${base64}`
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Bridge API
// ---------------------------------------------------------------------------

let pollTimer: ReturnType<typeof setInterval> | null = null
let lastCaptureTimestamp: string | null = null

async function ping(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/status`)
    if (!res.ok) return false
    const data: StatusResponse = await res.json()
    return data.connected === true
  } catch {
    return false
  }
}

async function fetchCapture(): Promise<CapturePayload | null> {
  try {
    const url = lastCaptureTimestamp
      ? `${BRIDGE_BASE_URL}/api/capture?after=${encodeURIComponent(lastCaptureTimestamp)}`
      : `${BRIDGE_BASE_URL}/api/capture`

    const res = await fetchWithTimeout(url)
    if (res.status === 204 || !res.ok) return null

    const payload: CapturePayload = await res.json()
    if (!payload.image || !payload.meta) return null
    return payload
  } catch {
    return null
  }
}

export async function pushResult(
  nodeId: string,
  imageBase64: string,
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${BRIDGE_BASE_URL}/api/result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodeId,
        image: imageBase64,
        timestamp: new Date().toISOString(),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Capture → Source node injection
// ---------------------------------------------------------------------------

function injectCapture(payload: CapturePayload) {
  const sceneMeta = toSceneMeta(payload.meta)
  const imageDataUri = toDataUri(payload.image)

  // Place at center-left of the canvas viewport
  const position = { x: 100, y: 200 }

  useGraphStore
    .getState()
    .createSourceNode(imageDataUri, 'sketchup', position, {
      sceneMeta,
      cameraLocked: true,
    })

  lastCaptureTimestamp = payload.timestamp
}

// ---------------------------------------------------------------------------
// Polling loop
// ---------------------------------------------------------------------------

async function pollOnce() {
  const setStatus = useUIStore.getState().setSketchUpStatus
  const isConnected = await ping()

  if (isConnected) {
    setStatus('connected')
    const capture = await fetchCapture()
    if (capture) {
      injectCapture(capture)
    }
  } else {
    setStatus('disconnected')
  }
}

export function startBridge() {
  if (pollTimer !== null) return

  useUIStore.getState().setSketchUpStatus('connecting')
  pollOnce()
  pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS)
}

export function stopBridge() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  useUIStore.getState().setSketchUpStatus('disconnected')
}
