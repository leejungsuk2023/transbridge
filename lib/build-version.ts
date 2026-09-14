/**
 * Build version stamp + auto-reload.
 *
 * The Android app is a Capacitor WebView that loads the deployed Vercel site.
 * When a new build ships, an app that was merely backgrounded (not killed)
 * keeps showing the old page because the SPA never reloads on its own. This
 * module exposes the current build's short commit SHA (for a visible version
 * stamp) and a hook that reloads the page when a newer build is detected.
 */
import { useEffect, useRef } from 'react';

export const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? 'dev';

const CHECK_INTERVAL_MS = 10_000;

/**
 * Client hook: checks /api/version on mount and whenever the page becomes
 * visible/focused again (e.g. app resumed from background), and reloads the
 * page if the deployed build's SHA differs from the one currently loaded.
 * Debounced to at most one check per CHECK_INTERVAL_MS. Never throws.
 */
export function useReloadOnNewBuild(): void {
  const lastCheckRef = useRef(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    async function checkForNewBuild() {
      const now = Date.now();
      if (now - lastCheckRef.current < CHECK_INTERVAL_MS) return;
      lastCheckRef.current = now;

      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        const data = await res.json();
        const sha = data?.sha;
        if (
          typeof sha === 'string' &&
          sha.length > 0 &&
          sha !== 'dev' &&
          BUILD_SHA !== 'dev' &&
          sha !== BUILD_SHA
        ) {
          window.location.reload();
        }
      } catch {
        // Ignore network errors — check again on the next trigger.
      }
    }

    checkForNewBuild();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkForNewBuild();
    };
    const onFocus = () => checkForNewBuild();

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', onFocus);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}
