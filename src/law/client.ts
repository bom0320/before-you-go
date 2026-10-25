import { request } from 'undici';
import { lawLimits, LawApiError } from './schema.js';

// No caller-supplied host/path, credentials header, redirects, retries or HTTP fallback.
export const lawApiOrigin = 'https://www.law.go.kr';
export type LawResponse = { statusCode: number; headers: Record<string, string | string[] | undefined>; body: AsyncIterable<Uint8Array> & { destroy(): void } };
export type LawTransport = (url: URL, signal: AbortSignal) => Promise<LawResponse>;
const transport: LawTransport = (url, signal) => request(url, {
  method: 'GET', signal, // undici.request does not follow redirects by default.
  headersTimeout: lawLimits.requestTimeoutMs, bodyTimeout: lawLimits.requestTimeoutMs,
  headers: { accept: 'application/json', 'accept-encoding': 'identity' },
});
export function createLawClient(options: { oc?: string; transport?: LawTransport; now?: () => number } = {}) {
  const oc = options.oc?.trim();
  const clock = options.now ?? Date.now;
  let start = clock(); let calls = 0; let active = 0;
  // Throw only fixed error codes. Neither OC nor original URL/body/exception leaves this module.
  async function call(endpoint: 'lawSearch.do' | 'lawService.do', params: Record<string, string>, parentSignal: AbortSignal): Promise<unknown> {
    if (!oc) throw new LawApiError('law_api_not_configured');
    if (clock() - start >= 60_000) { start = clock(); calls = 0; }
    if (calls >= lawLimits.maxCallsPerMinute || active >= lawLimits.maxConcurrent) throw new LawApiError('law_api_budget_exceeded');
    calls++; active++;
    const url = new URL(`/DRF/${endpoint}`, lawApiOrigin);
    url.search = new URLSearchParams({ ...params, target: 'eflaw', type: 'JSON', OC: oc }).toString();
    const signal = AbortSignal.any([parentSignal, AbortSignal.timeout(lawLimits.requestTimeoutMs)]);
    let body: LawResponse['body'] | undefined;
    const work = async () => {
      const response = await (options.transport ?? transport)(url, signal);
      body = response.body;
      if (signal.aborted) { body.destroy(); throw new LawApiError('law_api_timeout'); }
      if (response.statusCode >= 300 && response.statusCode < 400) throw new LawApiError('law_api_redirect_blocked');
      if (response.statusCode === 401 || response.statusCode === 403) throw new LawApiError('law_api_auth_failed');
      if (response.statusCode !== 200) throw new LawApiError('law_api_http_error');
      const type = String(response.headers['content-type'] ?? '');
      if (!/^application\/json\b/i.test(type) || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) throw new LawApiError('law_api_unexpected_format');
      if (Number(response.headers['content-length']) > lawLimits.maxResponseBytes) throw new LawApiError('law_api_response_too_large');
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of response.body) {
        signal.throwIfAborted();
        size += chunk.byteLength;
        if (size > lawLimits.maxResponseBytes) throw new LawApiError('law_api_response_too_large');
        chunks.push(Buffer.from(chunk));
      }
      // XML/HTML, malformed JSON and encodings are never treated as an empty successful search.
      try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) as unknown; }
      catch { throw new LawApiError('law_api_invalid_response'); }
    };
    let abort: () => void = () => {};
    try {
      if (signal.aborted) throw new LawApiError('law_api_timeout');
      const cancelled = new Promise<never>((_resolve, reject) => {
        abort = () => { body?.destroy(); reject(new LawApiError('law_api_timeout')); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      return await Promise.race([work(), cancelled]);
    } catch (error) {
      if (signal.aborted) throw new LawApiError('law_api_timeout');
      if (error instanceof LawApiError) throw error;
      throw new LawApiError('law_api_network_error');
    } finally { signal.removeEventListener('abort', abort); body?.destroy(); active--; }
  }
  // Guard normalized output too: raw API text and links may reflect request credentials.
  function safeOutput<T>(value: T): T {
    const encodedOc = oc ? [encodeURIComponent(oc), new URLSearchParams({ OC: oc }).toString().slice(3)].map(item => item.toLowerCase()) : [];
    const inspect = (item: unknown): void => {
      if (typeof item === 'string') {
        if ((oc && (item.includes(oc) || encodedOc.some(encoded => item.toLowerCase().includes(encoded)))) || /[?&]OC=/i.test(item)) throw new LawApiError('law_api_sensitive_response');
      } else if (Array.isArray(item)) item.forEach(inspect);
      else if (item && typeof item === 'object') Object.values(item).forEach(inspect);
    };
    inspect(value);
    return value;
  }
  return { call, safeOutput };
}
export type LawClient = ReturnType<typeof createLawClient>;
