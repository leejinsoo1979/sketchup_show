# 작업 지시: VizMaker(가칭) SaaS MVP — 로그인 + 크레딧 + 서버 렌더 프록시

너는 이 리포(`webapp/` = React 19 + TypeScript + Vite + Zustand, Vercel 배포)에 SaaS 계층을 추가한다.
목표: **사용자가 자기 API 키를 넣는 구조를 제거**하고, 로그인 → 크레딧 차감 → 서버가 Gemini를 대신 호출하는 구조로 전환한다.

## 0. 절대 규칙 (위반 금지)

1. `webapp/src/engine/autoPrompt.ts`의 프롬프트 공식(템플릿 문자열 내용)은 **한 글자도 수정 금지**.
2. `nano_banana_renderer/`(SketchUp 플러그인)와 로컬 브릿지(localhost:9876) 흐름은 **수정 금지**. 브릿지는 캡처/씬/카메라만 담당하고 인증과 무관하다.
3. 기존 화면(클래식 렌더 페이지, 노드 에디터)의 UI 구조를 바꾸지 마라. 인증 게이트와 Account 페이지만 추가한다.
4. 임시방편 금지. 크레딧 차감은 반드시 서버에서 원자적으로 처리한다 (클라이언트 신고 방식 금지).
5. 완료 선언 전에 반드시 §8 검증 절차를 실제로 실행하고 결과를 보고하라.

## 1. 스택 결정 (변경하지 말 것)

- **인증/DB**: Supabase (Auth: 이메일 매직링크 + Google OAuth / DB: Postgres)
- **서버**: Vercel Functions (리포 루트 `api/` 디렉터리, Node 런타임)
- **클라이언트**: 기존 webapp에 Supabase JS 클라이언트 추가 (`@supabase/supabase-js`)
- 결제는 이번 범위 아님. 크레딧은 관리자가 SQL로 충전한다.

## 2. 환경 변수

```
# webapp (VITE_ prefix = 클라이언트 노출 가능)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_DEV_BYPASS_AUTH=true   # 개발 모드: 로그인 우회 + 로컬 키 직접 호출 (기존 동작 유지)

# Vercel Functions 전용 (절대 클라이언트 노출 금지)
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=             # 운영자 키. 서버만 보유
```

`VITE_DEV_BYPASS_AUTH=true`일 때는 현재의 동작(로그인 없음, localStorage 키로 직접 Gemini 호출)이 그대로 유지되어야 한다. 이 플래그가 없거나 false면 SaaS 모드.

## 3. DB 스키마 (Supabase migration으로 생성)

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now()
);

create table public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 30,          -- 가입 보너스 30
  updated_at timestamptz default now()
);

create table public.render_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id),
  engine text not null,                          -- 'main' | 'pro' | 'auto_prompt'
  cost integer not null,
  status text not null,                          -- 'ok' | 'error'
  error text,
  created_at timestamptz default now()
);

-- RLS: 본인 행만 읽기 가능, 쓰기는 service role만
alter table public.profiles enable row level security;
alter table public.credits enable row level security;
alter table public.render_logs enable row level security;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own credits" on public.credits for select using (auth.uid() = user_id);
create policy "own logs" on public.render_logs for select using (auth.uid() = user_id);

-- 가입 시 자동 프로필+크레딧 생성 트리거
create function public.handle_new_user() returns trigger as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.credits (user_id) values (new.id);
  return new;
end; $$ language plpgsql security definer;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 원자적 차감 함수 (잔액 부족 시 실패)
create function public.spend_credits(p_user uuid, p_cost int) returns boolean as $$
declare ok boolean;
begin
  update public.credits set balance = balance - p_cost, updated_at = now()
    where user_id = p_user and balance >= p_cost;
  ok := found;
  return ok;
end; $$ language plpgsql security definer;
```

## 4. 서버: Vercel Functions (`api/`)

### `api/render.ts` (POST)
1. `Authorization: Bearer <supabase access token>` 검증 (service role 클라이언트의 `auth.getUser(token)`).
2. body: `{ engine: 'main'|'pro', image: base64, prompt: string, negativePrompt: string }`.
   이미지 크기 상한 8MB, prompt 상한 20k자. 초과 시 413/400.
3. 비용표: main(gemini-2.5-flash-image)=1크레딧, pro(gemini-3-pro-image)=4크레딧.
4. `spend_credits` RPC 호출 → false면 402 `{ error: 'INSUFFICIENT_CREDITS', balance }`.
5. 서버의 `GEMINI_API_KEY`로 Gemini `generateContent` 호출. 요청 형식은
   `webapp/src/engine/geminiClient.ts`의 기존 구현(시스템 인스트럭션, 네거티브 [NEGATIVE - MUST AVOID] 섹션 병합, model 매핑)을 **그대로 서버로 이식**한다.
6. 실패 시 크레딧 **환불**(balance 복구) 후 에러 반환. 성공/실패 모두 `render_logs`에 기록.
7. 응답: `{ image: base64, mimeType, balance }`.

### `api/auto-prompt.ts` (POST)
- 동일 인증. gemini-2.5-flash + `thinkingConfig:{thinkingBudget:0}` 텍스트 호출. 비용 1크레딧. 나머지 규칙 동일.

### `api/me.ts` (GET)
- 인증 후 `{ email, balance }` 반환.

공통: CORS는 Vercel 동일 오리진이라 불필요하지만, Electron(file://)에서 오는 요청을 위해 `Access-Control-Allow-Origin: *` + OPTIONS 처리 필요.

## 5. 클라이언트 변경 (webapp)

1. `src/auth/supabase.ts` — 클라이언트 싱글턴. `src/auth/AuthGate.tsx` — 세션 없으면 로그인 화면(이메일 매직링크 + Google 버튼, 앱 다크 테마 준수), 있으면 children 렌더. `VITE_DEV_BYPASS_AUTH=true`면 무조건 통과.
2. `src/engine/adapters/mainRenderer.ts`와 autoPrompt의 **호출부만** 분기:
   - dev bypass 모드 → 기존 geminiClient 직접 호출 (현행 유지)
   - SaaS 모드 → `fetch('/api/render')` / `/api/auto-prompt` (Bearer 토큰 첨부)
   반환 형태는 기존과 동일하게 맞춰서 파이프라인/클래식 페이지 코드는 무수정.
3. 402 응답 처리: "크레딧이 부족합니다 (잔액 n)" 상태 표시. 앱 크래시 금지.
4. Account 페이지(`src/editor/pages/MiscPages.tsx`의 Account 부분)를 실제 데이터로: 이메일, 잔액(`/api/me`), 로그아웃 버튼, 최근 렌더 로그 10건(Supabase select).
5. Settings의 API 키 입력 UI는 dev bypass 모드에서만 노출하고 "개발자 모드" 라벨을 붙인다.
6. Make 버튼 옆 `Credits: n`을 실제 잔액으로 (SaaS 모드일 때).

## 6. Electron 주의사항

- 패키징된 앱은 `file://`로 로드되므로 Supabase OAuth 리다이렉트가 안 된다. Electron에서는 **이메일 매직링크 + `supabase.auth.verifyOtp` 코드 입력 방식**을 기본으로 하라 (매직링크 메일에 6자리 코드 포함 설정). Google OAuth는 웹 전용.
- 세션은 localStorage 유지(기본값)로 충분.

## 7. 하지 말 것

- Stripe/결제 붙이지 마라 (다음 단계).
- 기존 렌더 파이프라인/노드 타입/프리셋 데이터 구조 리팩터링 금지.
- Supabase RLS 없이 anon 키로 테이블 쓰기 열지 마라.
- `GEMINI_API_KEY`를 클라이언트 번들에 넣거나 로그에 출력하지 마라.

## 8. 완료 기준 (전부 실제 실행으로 증명)

1. `VITE_DEV_BYPASS_AUTH=true`로 빌드 → 기존 동작 100% 동일 (로그인 화면 없음, 렌더 작동).
2. SaaS 모드 빌드 → 미로그인 시 로그인 화면, 가입 → credits 30 자동 생성 확인.
3. 로그인 상태에서 Make → `/api/render` 경유 렌더 성공 + 잔액 1 감소 + render_logs 기록.
4. 잔액 0 계정으로 Make → 402 + UI에 잔액 부족 메시지, 크래시 없음.
5. Gemini 강제 실패(잘못된 모델명으로 임시 테스트) 시 크레딧 환불 확인.
6. `npm run build` 에러 0, `npx tsc --noEmit` 에러 0.
7. Playwright E2E: 로그인 우회 모드에서 기존 E2E(`tools/e2e/`) 통과.

각 항목을 스크린샷 또는 명령 출력으로 증빙하고, 하나라도 실패하면 완료라고 말하지 마라.
