import { z } from 'zod';

export const lawLimits = Object.freeze({ requestTimeoutMs: 15_000, maxResponseBytes: 1_000_000, maxOutputChars: 24_000, maxArticles: 20, maxResults: 10, maxCallsPerMinute: 12, maxConcurrent: 2 });
const identifier = z.string().regex(/^\d{1,12}$/);
const date = z.string().regex(/^\d{8}$/).refine(value => {
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`;
  const parsed = new Date(iso);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === iso;
}, 'Valid YYYYMMDD date required');
export const searchLawsInput = z.strictObject({
  query: z.string().trim().min(1).max(100).describe('법령명 검색어. 개인정보를 입력하지 마세요.'),
  version: z.enum(['current', 'scheduled', 'historical', 'all']).optional().describe('기본 current. 현행·시행예정·연혁을 구분합니다.'),
  display: z.number().int().min(1).max(lawLimits.maxResults).optional(),
  page: z.number().int().min(1).max(100).optional(),
});
export const getLawInput = z.strictObject({
  lawId: identifier.optional().describe('검색 결과 lawId. ID 조회는 현행 본문이므로 과거·시행예정 버전에는 masterId를 사용하세요.'),
  masterId: identifier.optional().describe('검색 결과 masterId(법령일련번호/MST). effectiveDate와 함께 사용합니다.'),
  effectiveDate: date.optional().describe('MST 조회에 필수인 시행일 YYYYMMDD. ID 조회에는 지정하지 않습니다.'),
  article: z.number().int().min(1).max(9999).optional().describe('관련 조문 번호. 예: 2 → JO=000200. 생략 시 크기 제한 내 본문 조문만 반환.'),
  articleBranch: z.number().int().min(1).max(99).optional().describe('가지번호. 제10조의2이면 article=10, articleBranch=2.'),
}).superRefine((value, context) => {
  if (Boolean(value.lawId) === Boolean(value.masterId)) context.addIssue({ code: 'custom', message: 'lawId 또는 masterId 중 하나만 지정하세요.' });
  if (value.masterId && !value.effectiveDate) context.addIssue({ code: 'custom', message: 'masterId에는 effectiveDate가 필요합니다.' });
  if (value.lawId && value.effectiveDate) context.addIssue({ code: 'custom', message: 'lawId 조회는 시행일을 무시하므로 effectiveDate를 허용하지 않습니다.' });
  if (value.articleBranch && !value.article) context.addIssue({ code: 'custom', message: 'articleBranch에는 article이 필요합니다.' });
});
export type SearchLawsInput = z.infer<typeof searchLawsInput>;
export type GetLawInput = z.infer<typeof getLawInput>;
export const articleCode = (article: number, branch = 0) => `${String(article).padStart(4, '0')}${String(branch).padStart(2, '0')}`;

const rawNumber = z.union([z.string().regex(/^\d{1,12}$/), z.number().int().nonnegative().max(999_999_999_999)]).transform(String);
const rawDate = z.union([z.string(), z.number().int()]).transform(String).pipe(date);
const textValue = z.union([z.string(), z.array(z.string())]);
const list = <T extends z.ZodType>(item: T) => z.union([z.array(item), item]).transform(value => Array.isArray(value) ? value : [value]);
const rawItem = z.object({ '목내용': textValue, '목번호': z.string().optional() });
const rawSubparagraph = z.object({ '호내용': textValue, '호번호': z.string().optional(), '목': list(rawItem).optional() });
const rawParagraph = z.object({ '항내용': textValue.optional(), '항번호': z.string().optional(), '호': list(rawSubparagraph).optional() });
export const rawArticle = z.object({
  '조문번호': rawNumber, '조문가지번호': rawNumber.optional(), '조문여부': z.string(),
  '조문제목': z.string().optional(), '조문내용': textValue,
  '조문시행일자': rawDate.optional(), '항': list(rawParagraph).optional(), '호': list(rawSubparagraph).optional(),
});
export const rawLawResponse = z.object({ '법령': z.object({
  '기본정보': z.object({ '법령명_한글': z.string().min(1), '법령ID': rawNumber, '시행일자': rawDate }),
  '조문': z.object({ '조문단위': list(rawArticle) }),
}) });
export const rawSearchResponse = z.object({ LawSearch: z.object({
  resultCode: z.string(), target: z.literal('eflaw'), totalCnt: rawNumber, page: rawNumber,
  law: list(z.object({
    '법령명한글': z.string().min(1), '법령ID': rawNumber, '법령일련번호': rawNumber,
    '현행연혁코드': z.string().min(1), '시행일자': rawDate,
    // Detail link can contain OC. It is deliberately never used as an output URL.
  })).optional(),
}) });
const sourceUrl = z.url({ protocol: /^https$/ });
export const searchLawsOutput = z.strictObject({
  mode: z.literal('official_law_search'), provider: z.literal('법제처 국가법령정보센터'), retrievedAt: z.iso.datetime(),
  page: z.number().int(), totalCount: z.number().int(), versionFilter: z.enum(['current', 'scheduled', 'historical', 'all']),
  laws: z.array(z.strictObject({ title: z.string(), lawId: identifier, masterId: identifier, version: z.string(), effectiveDate: date, sourceUrl })).max(lawLimits.maxResults), notice: z.string(),
});
export const getLawOutput = z.strictObject({
  mode: z.literal('official_law_text'), provider: z.literal('법제처 국가법령정보센터'), retrievedAt: z.iso.datetime(),
  title: z.string(), lawId: identifier, masterId: identifier.nullable(), effectiveDate: date,
  retrievalMode: z.enum(['current_by_id', 'version_by_master']), sourceUrl,
  scope: z.enum(['requested_article', 'main_articles']),
  articles: z.array(z.strictObject({ number: z.number().int(), branch: z.number().int(), title: z.string().nullable(), effectiveDate: date.nullable(), jo: z.string().regex(/^\d{6}$/), text: z.string().min(1) })).min(1).max(lawLimits.maxArticles),
  notice: z.string(),
});
export class LawApiError extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'LawApiError'; }
}
