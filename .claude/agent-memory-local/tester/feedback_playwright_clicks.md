---
name: Playwright click workaround for MedTranslate
description: browser_click does not reliably fire React onClick on this app — use browser_evaluate instead
type: feedback
---

Playwright MCP `browser_click` does NOT reliably trigger React synthetic event handlers on MedTranslate dashboard buttons (language selector, start session, logout).

**Why:** The app uses React synthetic events. Playwright's `browser_click` sometimes does not dispatch the correct event type to trigger React's event delegation system, especially when the snapshot ref-based click targets a parent element.

**How to apply:** When `browser_click` fails to update React state (button remains disabled / action does not fire), switch to `browser_evaluate` with a direct `.click()` call:

```js
// Find and click the Thai language button
Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent?.includes('태국어'))
  ?.click();
```

This reliably fires React synthetic events. Use this pattern for:
- Language selector buttons on dashboard
- "통역 시작" button on dashboard
- "로그아웃" button on dashboard

Note: `browser_type` (fill) works correctly for text inputs — only button clicks are affected.
