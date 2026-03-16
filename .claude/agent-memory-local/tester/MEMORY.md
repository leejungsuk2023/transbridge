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

## Memory Files
- [feedback_playwright_clicks.md](feedback_playwright_clicks.md) — Playwright click workaround details
