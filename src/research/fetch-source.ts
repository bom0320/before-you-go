import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { Agent, request } from 'undici';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { researchLimits, ResearchError, type Candidate, type Source } from './schema.js';

export const allowedDomains = Object.freeze(['nps.or.kr', 'gov.kr', 'law.go.kr']);
export function officialUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ResearchError('blocked_url', '공식 HTTPS URL이 아닙니다.'); }
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')
    || !allowedDomains.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) {
    throw new ResearchError('blocked_url', '허용된 공식 기관 HTTPS 주소만 열람할 수 있습니다.');
  }
  url.hash = '';
  return url;
}
export const normalizeText = (value: string) => value.normalize('NFC').replace(/\s+/g, ' ').trim();
export function publicAddress(address: string): boolean {
  try { return ipaddr.parse(address).range() === 'unicast'; } catch { return false; }
}

// Public DNS answers are pinned into the connection lookup: no resolve-then-fetch race.
export type AddressResolver = (hostname: string) => Promise<{ address: string; family: number }[]>;
async function pinnedAgent(hostname: string, resolve: AddressResolver, signal: AbortSignal) {
  const addresses = await new Promise<{ address: string; family: number }[]>((accept, reject) => {
    const abort = () => reject(new ResearchError('source_timeout', '원문 DNS 조회 제한 시간을 초과했습니다.'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => resolve(hostname)).then(accept, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
  if (!addresses.length || addresses.some(record => !publicAddress(record.address))) {
    throw new ResearchError('blocked_address', '내부·예약 IP 주소로의 연결을 차단했습니다.');
  }
  const pinned: LookupFunction = (_host, options, callback) => {
    const records = addresses.filter(record => !options.family || record.family === options.family);
    if (!records.length) { callback(new Error('No pinned address'), '', 0); return; }
    if (options.all) callback(null, records);
    else callback(null, records[0].address, records[0].family);
  };
  return new Agent({ connect: { lookup: pinned } });
}

export function extractDocument(html: string, contentType: string, base: URL): { text: string; links: string[] } {
  if (/^text\/plain\b/i.test(contentType)) return { text: normalizeText(html), links: [] };
  if (!/^text\/html\b|^application\/xhtml\+xml\b/i.test(contentType)) {
    throw new ResearchError('unsupported_document', 'HTML·텍스트 공개 원문만 열람할 수 있습니다.');
  }
  const $ = load(html);
  $('script,style,noscript,iframe,input,textarea,select,button,nav,header,footer,[hidden],[aria-hidden="true"]').remove();
  const main = $('#contents, main, article, #content').first();
  const body = main.length ? main : $('body');
  const links: string[] = [];
  body.find('a[href]').each((_index, element) => {
    const href = $(element).attr('href');
    if (href && !/^(javascript:|data:|#)/i.test(href)) {
      try { links.push(officialUrl(new URL(href, base).href).href); } catch { /* blocked link is not a candidate */ }
    }
  });
  body.find('br').replaceWith(' ');
  body.find('p,div,li,tr,td,th,h1,h2,h3,h4,h5,section').append(' ');
  return { text: normalizeText(body.text()), links: [...new Set(links)].slice(0, 30) };
}

export type SourceResponse = { statusCode: number; headers: Record<string, string | string[] | undefined>; body: AsyncIterable<Uint8Array> & { destroy(): void } };
export type SourceRequest = (url: URL, options: Parameters<typeof request>[1]) => Promise<SourceResponse>;
export async function fetchSource(candidate: Candidate, signal: AbortSignal, transport: { resolve?: AddressResolver; request?: SourceRequest } = {}): Promise<Source> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(researchLimits.requestTimeoutMs)]);
  let url = officialUrl(candidate.url);
  const seen = new Set<string>();
  for (let hop = 0; hop <= researchLimits.maxRedirects; hop++) {
    requestSignal.throwIfAborted();
    if (seen.has(url.href)) throw new ResearchError('redirect_loop', '리다이렉트 순환을 차단했습니다.');
    seen.add(url.href);
    const agent = await pinnedAgent(url.hostname, transport.resolve ?? (host => lookup(host, { all: true, verbatim: true })), requestSignal);
    try {
      const response = await (transport.request ?? request)(url, {
        method: 'GET', dispatcher: agent, signal: requestSignal, // undici.request does not follow redirects by default.
        headersTimeout: researchLimits.requestTimeoutMs, bodyTimeout: researchLimits.requestTimeoutMs,
        headers: { accept: 'text/html, text/plain, application/xhtml+xml', 'accept-encoding': 'identity', 'user-agent': 'BeforeYouGo-Research/0.1' },
      });
      if (response.statusCode >= 300 && response.statusCode < 400) {
        response.body.destroy();
        const location = response.headers.location;
        if (typeof location !== 'string' || hop === researchLimits.maxRedirects) throw new ResearchError('redirect_limit', '리다이렉트 한도 또는 연결 주소 오류입니다.');
        url = officialUrl(new URL(location, url).href);
        continue;
      }
      if (response.statusCode !== 200) {
        response.body.destroy();
        throw new ResearchError('source_http_error', '공식 원문이 정상 공개 응답을 반환하지 않았습니다.');
      }
      const type = String(response.headers['content-type'] ?? '');
      if (!/^(text\/html|text\/plain|application\/xhtml\+xml)\b/i.test(type)
        || (response.headers['content-encoding'] && response.headers['content-encoding'] !== 'identity')) {
        response.body.destroy();
        throw new ResearchError('unsupported_document', '지원하지 않는 원문 형식 또는 압축 응답입니다.');
      }
      const parts: Buffer[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > researchLimits.maxDocumentBytes) {
          response.body.destroy();
          throw new ResearchError('document_too_large', '원문 크기 제한을 초과했습니다.');
        }
        parts.push(Buffer.from(chunk));
      }
      const charset = /charset\s*=\s*["']?([^\s;"']+)/i.exec(type)?.[1] ?? 'utf-8';
      let html: string;
      try { html = new TextDecoder(charset, { fatal: true }).decode(Buffer.concat(parts)); }
      catch { throw new ResearchError('unsupported_encoding', '원문 문자 인코딩을 확인할 수 없습니다.'); }
      const doc = extractDocument(html, type, url);
      if (doc.text.length < 40) throw new ResearchError('empty_source', '열람할 원문 내용이 없습니다.');
      if (doc.text.length > researchLimits.maxDocumentChars) throw new ResearchError('document_too_large', '추출 원문의 문자 제한을 초과했습니다.');
      // A login/access-denied page is not an inspected procedure document.
      if (/로그인 필요|접근 권한이 없|access denied|captcha|enable javascript/i.test(doc.text)) {
        throw new ResearchError('inaccessible_source', '인증 또는 JavaScript 실행이 필요한 문서입니다.');
      }
      return { id: candidate.id, url: url.href, text: doc.text, links: doc.links, retrievedAt: new Date().toISOString() };
    } catch (error) {
      if (requestSignal.aborted) throw new ResearchError('source_timeout', '공식 원문 조회가 취소되었거나 제한 시간을 초과했습니다.');
      if (error instanceof ResearchError) throw error;
      throw new ResearchError('source_fetch_failed', '공식 원문 네트워크 조회에 실패했습니다.');
    } finally { await agent.close(); }
  }
  throw new ResearchError('redirect_limit', '리다이렉트 한도를 초과했습니다.');
}
