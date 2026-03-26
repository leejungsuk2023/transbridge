/**
 * Fetch utility with automatic retry, timeout, and exponential backoff.
 * Retries on network errors and 5xx responses; never retries on 4xx.
 */

interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Per-attempt timeout in milliseconds (default: 10000) */
  timeoutMs?: number;
  /** Initial backoff in milliseconds, doubles on each retry (default: 1000) */
  backoffMs?: number;
}

/**
 * Fetch a URL with automatic retry on network errors and 5xx responses.
 *
 * @param url - The URL to fetch
 * @param options - Standard RequestInit options
 * @param config - Retry/timeout configuration
 * @returns The successful Response object
 * @throws The last error if all attempts are exhausted
 */
export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  config?: RetryConfig
): Promise<Response> {
  const maxRetries = config?.maxRetries ?? 3;
  const timeoutMs = config?.timeoutMs ?? 10_000;
  const initialBackoffMs = config?.backoffMs ?? 1_000;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Abort controller provides per-attempt timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // 4xx errors are not retried — caller must handle them
      if (response.status >= 400 && response.status < 500) {
        return response;
      }

      // 5xx errors: retry if attempts remain
      if (response.status >= 500) {
        lastError = new Error(
          `Server error: HTTP ${response.status} from ${url}`
        );
        if (attempt < maxRetries) {
          const delay = initialBackoffMs * 2 ** attempt;
          console.warn(
            `[fetchWithRetry] Attempt ${attempt + 1}/${maxRetries + 1} failed with HTTP ${response.status}. Retrying in ${delay}ms…`
          );
          await _sleep(delay);
          continue;
        }
        // Return the 5xx response on the final attempt so the caller can read the body
        return response;
      }

      // 2xx / 3xx — success
      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      const isAbort =
        err instanceof DOMException && err.name === "AbortError";
      lastError = isAbort
        ? new Error(`Request timed out after ${timeoutMs}ms: ${url}`)
        : err;

      if (attempt < maxRetries) {
        const delay = initialBackoffMs * 2 ** attempt;
        console.warn(
          `[fetchWithRetry] Attempt ${attempt + 1}/${maxRetries + 1} failed (${
            isAbort ? "timeout" : (err instanceof Error ? err.message : String(err))
          }). Retrying in ${delay}ms…`
        );
        await _sleep(delay);
      } else {
        console.error(
          `[fetchWithRetry] All ${maxRetries + 1} attempts failed for ${url}`
        );
      }
    }
  }

  throw lastError;
}

function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
