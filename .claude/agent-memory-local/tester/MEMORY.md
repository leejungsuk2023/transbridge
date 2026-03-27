# Tester Agent Memory — MedTranslate (Trans Bridge)

## Project
- Dev server: localhost:3002 (NOT 3000 — port 3000 is occupied by "SyncBridge", another project)
- Project dir: /Users/suwipachutasripanich/Trans bridge/ (space in path — always quote)
- Routes: / (login), /dashboard, /session/[id], /join/[id]
- Start command: `node node_modules/next/dist/bin/next dev -p 3002` (npm run dev fails on Node v24)

## Auth
- Backend: Supabase (NOT Firebase — project has been migrated to Supabase)
- Login page: http://localhost:3002/ (root path, NOT /app)
- Test account works: test@hospital.com / password123
- Post-login redirect: /dashboard
- Post-logout redirect: /

## Playwright Click Quirk
- `browser_click` does NOT reliably fire React onClick handlers for buttons on this app
- Workaround: use `browser_evaluate` with `element.click()` to trigger React synthetic events
- Example: `Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('태국어')).click()`
- This is a Playwright MCP quirk, not an app bug

## Audio
- PTT, TTS features cannot be tested via Playwright — mark as "수동 테스트 필요"

## Port Situation
- Port 3000: SyncBridge (different project at ~/g sync/client-web) — do NOT test MedTranslate here
- Port 3002: MedTranslate (Trans Bridge) — always use this port

## CLI Tools on Node v24
- `npx next lint` and `npx tsc --noEmit` fail on Node v24 (module not found)
- Use `node node_modules/next/dist/bin/next lint` and `node node_modules/typescript/bin/tsc --noEmit` instead
- Build: `node node_modules/next/dist/bin/next build`

## API Behavior Notes
- POST /api/session with empty `{}` body succeeds (patientLang: null) — no server-side validation
- POST /api/session with invalid lang returns `{"success":false,"error":"Failed to create session"}` — standardized error format confirmed
- POST /api/session with valid lang returns `{"success":true,"data":{...}}` — standardized success format

## Error Boundaries
- `app/error.tsx` — global error boundary with "다시 시도" button
- `app/session/[id]/error.tsx` — session-specific with "다시 시도" + "대시보드로 돌아가기"
- These are NOT triggered by invalid session IDs — page renders normally with invalid ID

## OfflineOverlay
- Mounted in `app/layout.tsx` — renders `null` when online (correct behavior)
- When offline: shows modal overlay "인터넷 연결 끊김"
- Cannot test offline state via Playwright without network throttling

## Session Page Behavior with Invalid ID
- `/session/invalid-id?lang=th` renders the session UI normally (no 404 or error)
- This is a known gap — no server-side session ID validation before rendering

## Memory Files
- [feedback_playwright_clicks.md](feedback_playwright_clicks.md) — Playwright click workaround details
