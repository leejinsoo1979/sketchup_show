import { useState } from 'react'
import { getStoredApiKey, setStoredApiKey } from '../../engine/geminiClient'
import { saasMode } from '../../api/lumanovaApi'
import { useUIStore } from '../../state/uiStore'

// ---------------------------------------------------------------------------
// Settings — 실물 VizMaker 디자인 언어 (좌측 큰 제목 + 전체폭 섹션 행)
// SaaS 모드: 연동/정보만. API Key 입력은 개발자 모드 전용.
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#17171d', border: '1px solid #24242c', borderRadius: 10, marginBottom: 14 }}>
      <div style={{ padding: '13px 20px', borderBottom: '1px solid #22222a', color: '#e8e8ee', fontSize: 13.5, fontWeight: 600 }}>
        {title}
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between" style={{ padding: '6px 0' }}>
      <span style={{ color: '#a9a9b4', fontSize: 12.5 }}>{label}</span>
      <span style={{ color: '#e6e6ee', fontSize: 12.5, fontWeight: 500 }}>{value}</span>
    </div>
  )
}

export function SettingsPage() {
  const saas = saasMode()
  const status = useUIStore((s) => s.sketchUpStatus)

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: '#0d0d11', padding: '36px 48px' }}>
      <h1 style={{ color: '#ffffff', fontSize: 26, fontWeight: 700, marginBottom: 24 }}>Settings</h1>

      <Section title="SketchUp 연동">
        <Row
          label="연결 상태"
          value={
            <span style={{ color: status === 'connected' ? '#4cd6a8' : '#ff7777' }}>
              {status === 'connected' ? '● 연결됨' : '○ 연결 안 됨'}
            </span>
          }
        />
        <Row label="플러그인" value="NanoBanana Renderer v1.0.5" />
        <div style={{ marginTop: 8, fontSize: 11.5, color: '#71717c', lineHeight: 1.6 }}>
          SketchUp을 실행하면 자동으로 연결됩니다. 연결이 안 되면 SketchUp을 재시작하세요.
        </div>
      </Section>

      {!saas && <DevApiKeySection />}

      <Section title="정보">
        <Row label="앱" value="Lumanova" />
        <Row label="버전" value="1.0.5" />
        <Row label="업데이트 채널" value="Stable" />
      </Section>
    </div>
  )
}

// 개발자 모드 전용: 로컬 Gemini API Key (SaaS 모드에서는 서버가 키를 보유하므로 불필요)
function DevApiKeySection() {
  const [apiKey, setApiKey] = useState(() => getStoredApiKey() ?? '')
  const [saved, setSaved] = useState(false)
  const [revealed, setRevealed] = useState(false)

  const handleSave = () => {
    setStoredApiKey(apiKey.trim())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <Section title="Gemini API Key (개발자 모드)">
      <div className="flex gap-2">
        <input
          type={revealed ? 'text' : 'password'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="AIza..."
          className="flex-1 rounded-lg px-3 outline-none"
          style={{ height: 38, background: '#0d0d15', border: '1px solid #26262f', color: '#fff', fontSize: 13 }}
        />
        <button
          onClick={() => setRevealed((v) => !v)}
          style={{ height: 38, padding: '0 12px', borderRadius: 8, background: '#1e1e28', border: '1px solid #2c2c38', color: '#a9a9b4', fontSize: 12 }}
        >
          {revealed ? '숨김' : '표시'}
        </button>
        <button
          onClick={handleSave}
          style={{ height: 38, padding: '0 18px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, background: '#00c9a7', color: '#06251f' }}
        >
          {saved ? '저장됨 ✓' : '저장'}
        </button>
      </div>
      <div style={{ marginTop: 8, fontSize: 11.5, color: '#71717c' }}>
        키는 이 컴퓨터에만 저장됩니다.{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#00c9a7' }}>
          Google AI Studio에서 발급
        </a>
      </div>
    </Section>
  )
}
