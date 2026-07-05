import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './app/App'
import { AuthGate } from './auth/AuthGate'
import { LandingPage } from './landing/LandingPage'

// 경로 분기: /app(및 하위)만 로그인 게이트+에디터, 그 외는 랜딩 페이지.
// 라우터 라이브러리 없이 최소 분기 (에디터는 SPA 내부 상태로 화면 전환).
// Electron(file:// 또는 localhost 정적 서빙)에서는 항상 앱으로 진입.
const path = window.location.pathname
const isElectron = Boolean((window as unknown as { vizmakerNative?: unknown }).vizmakerNative)
const isApp = isElectron || path === '/app' || path.startsWith('/app/')

// 랜딩 페이지는 세로 스크롤이 필요하므로 에디터용 100vh/overflow:hidden을 해제
if (!isApp) document.documentElement.classList.add('landing')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isApp ? (
      <AuthGate>
        <App />
      </AuthGate>
    ) : (
      <LandingPage />
    )}
  </StrictMode>,
)
