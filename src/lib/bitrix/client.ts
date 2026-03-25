import { logger } from '../logger';
import { WEBHOOK } from './config';

// Bitrix REST schema is method-specific and dynamic, so a strict shared type is not practical here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function callBitrix(method: string, params: Record<string, unknown>): Promise<any> {
  const url = `${WEBHOOK}/${method}.json`;
  const maxAttempts = 4;
  let lastError: Error | null = null;

  const shouldRetryHttp = (status: number) => status === 429 || status >= 500;
  const shouldRetryBitrix = (code: string) =>
    code === 'QUERY_LIMIT_EXCEEDED' ||
    code === 'TOO_MANY_REQUESTS' ||
    code === 'TIMEOUT';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      const bodyText = await response.text();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let data: any = {};
      try {
        data = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        data = {};
      }

      if (!response.ok) {
        const err = new Error(`Bitrix HTTP ${response.status} at ${method}: ${bodyText || 'empty response'}`);
        lastError = err;
        if (attempt < maxAttempts && shouldRetryHttp(response.status)) {
          logger.warn('bitrix.call', `Retry ${attempt}/${maxAttempts} for ${method} after HTTP ${response.status}`);
          await new Promise(resolve => setTimeout(resolve, 350 * attempt));
          continue;
        }
        throw err;
      }

      if (data.error) {
        const code = String(data.error || '').trim().toUpperCase();
        const desc = String(data.error_description || data.error || 'Unknown Bitrix error');
        const err = new Error(`Bitrix ${method} error ${code}: ${desc}`);
        lastError = err;
        if (attempt < maxAttempts && shouldRetryBitrix(code)) {
          logger.warn('bitrix.call', `Retry ${attempt}/${maxAttempts} for ${method} after ${code}`);
          await new Promise(resolve => setTimeout(resolve, 350 * attempt));
          continue;
        }
        throw err;
      }

      return data.result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const networkLike = /failed to fetch|networkerror|network request failed|load failed/i.test(message);
      lastError = e instanceof Error ? e : new Error(message);

      if (attempt < maxAttempts && networkLike) {
        logger.warn('bitrix.call', `Retry ${attempt}/${maxAttempts} for ${method} after network error: ${message}`);
        await new Promise(resolve => setTimeout(resolve, 350 * attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`Bitrix call failed: ${method}`);
}
