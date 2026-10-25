import { getInputResolution, resolveProcedure } from '../procedure/check.js';
import type { Evidence, ProcedureInput, ProcedureResult } from '../procedure/schema.js';
import { officialUrl } from './fetch-source.js';
import { createResearcher } from './researcher.js';
import { decisionSchema, reviewSchema, researchLimits, ResearchError, type ResearchContext, type ResearchDependencies, type ResearchLimits } from './schema.js';
import { groundFindings, reviewedEvidence, validateDraft } from './validate-evidence.js';

// Also bounds injected implementations that ignore cancellation (tests and adapters).
export async function bounded<T>(operation: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new ResearchError('timeout', '조사 실행이 취소되었거나 제한 시간을 초과했습니다.');
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new ResearchError('timeout', '조사 실행이 취소되었거나 제한 시간을 초과했습니다.'));
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
function partialResult(evidence: Evidence[], message: string): ProcedureResult {
  return {
    mode: 'procedure_check', status: 'needs_verification', summary: '일부 원문 근거만 확인했습니다. 신청 가능성을 확정하지 않습니다.',
    missingInformation: [], uncertainties: [{ code: 'research_limit', message }], channels: [],
    checks: evidence.map((fact, index) => ({ id: `partial-${index + 1}`, outcome: 'unverified', explanation: `${fact.fact} 적용 범위: ${fact.scope}`, evidenceIds: [fact.id] })),
    nextActions: [{ kind: 'verify_official_information', channelId: null, instruction: '남은 적용 조건을 공식 원문에서 추가 확인해야 합니다.', evidenceIds: [] }], evidence,
  };
}
export async function runResearch(input: ProcedureInput, options: {
  dependencies?: ResearchDependencies; limits?: ResearchLimits; signal?: AbortSignal;
} = {}): Promise<ProcedureResult> {
  const preflight = getInputResolution(input);
  if (preflight) return preflight;
  const limits = options.limits ?? researchLimits;
  for (const key of Object.keys(researchLimits) as (keyof ResearchLimits)[]) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] <= 0 || limits[key] > researchLimits[key]) {
      throw new ResearchError('invalid_limits', '조사 한도는 서버 정책 이내의 양의 정수여야 합니다.');
    }
  }
  const signal = AbortSignal.any([AbortSignal.timeout(limits.totalTimeoutMs), ...(options.signal ? [options.signal] : [])]);
  const dependencies = options.dependencies ?? createResearcher();
  const context: ResearchContext = {
    input: { ...input }, candidates: [], sources: [], failures: [], feedback: [],
    remaining: { rounds: limits.maxRounds, searches: limits.maxSearchQueries, inspections: limits.maxSources },
  };
  const attempted = new Set<string>();
  let partial: ProcedureResult | undefined;
  const admit = (urls: string[]) => {
    for (const raw of urls) {
      try {
        const url = officialUrl(raw).href;
        if (!context.candidates.some(item => item.url === url) && context.candidates.length < limits.maxSources * limits.maxSearchQueries) {
          context.candidates.push({ id: `source-${context.candidates.length + 1}`, url });
        }
      } catch { context.feedback.push('unofficial_search_candidate_blocked'); }
    }
  };
  for (let round = 0; round < limits.maxRounds; round++) {
    context.remaining.rounds = limits.maxRounds - round - 1;
    const decision = decisionSchema.parse({ decision: await bounded(() => dependencies.decide(structuredClone(context), signal), signal) }).decision;
    if (decision.type === 'needs_information') {
      if (decision.questions.some(question => question.field !== 'goal' && input[question.field] && input[question.field] !== 'unknown')) {
        context.feedback.push('Do not ask again for already provided structured information.');
        continue;
      }
      return {
        mode: 'procedure_check', status: 'needs_information', summary: '정확한 절차 조사를 위해 상황을 추가로 확인해야 합니다.',
        missingInformation: decision.questions, uncertainties: [], checks: [], channels: [], evidence: [],
        nextActions: decision.questions.map(question => ({ kind: 'answer_question', channelId: null, instruction: question.question, evidenceIds: [] })),
      };
    }
    if (decision.type === 'search') {
      if (new Set(decision.queries).size !== decision.queries.length || decision.queries.length > context.remaining.searches) {
        context.feedback.push('search_budget_exceeded'); continue;
      }
      for (const query of decision.queries) {
        context.remaining.searches--;
        admit(await bounded(() => dependencies.search(query, signal), signal));
      }
    } else if (decision.type === 'inspect') {
      const ids = [...new Set(decision.sourceIds)];
      if (ids.some(id => !context.candidates.some(candidate => candidate.id === id)) || ids.length > context.remaining.inspections) {
        context.feedback.push('inspection_budget_or_source_reference_invalid'); continue;
      }
      for (const id of ids) {
        const candidate = context.candidates.find(item => item.id === id)!;
        if (attempted.has(candidate.url)) { context.feedback.push('source_already_attempted'); continue; }
        attempted.add(candidate.url); context.remaining.inspections--;
        try {
          const source = await bounded(() => dependencies.inspect({ ...candidate }, signal), signal);
          officialUrl(source.url);
          if (source.id !== id || !source.text.trim() || source.text.length > limits.maxDocumentChars) throw new ResearchError('invalid_source', '열람 원문 컨텍스트가 잘못되었습니다.');
          context.sources.push(source); admit(source.links);
        } catch (error) {
          if (signal.aborted) throw new ResearchError('timeout', '전체 조사 제한 시간을 초과했습니다.');
          context.failures.push({ sourceId: id, code: error instanceof ResearchError ? error.code : 'source_fetch_failed' });
        }
      }
    } else {
      const grounded = groundFindings(context, decision);
      if (!grounded.findings.length) { context.feedback.push(...grounded.errors, 'no_grounded_findings'); continue; }
      const review = reviewSchema.parse(await bounded(() => dependencies.review(structuredClone(context), { ...decision, findings: grounded.findings }, signal), signal));
      const evidence = reviewedEvidence(context, grounded.findings, review);
      if (evidence.length) partial = partialResult([...new Map(evidence.map(item => [item.id, item])).values()], '라운드 한도 내에 적용 조건과 전체 응답의 근거 검증을 완료하지 못했습니다.');
      const validation = validateDraft(input, context, decision, evidence, review);
      if (grounded.errors.length || validation.errors.length) {
        context.feedback.push(...grounded.errors, ...validation.errors, review.reason); continue;
      }
      const result = resolveProcedure(input, validation.result, evidence);
      if (context.failures.length) result.uncertainties.push({ code: 'source_unavailable', message: `일부 원문 열람 실패: ${context.failures.map(item => `${item.sourceId}:${item.code}`).join(', ')}. 해당 문서는 근거로 사용하지 않았습니다.` });
      return result;
    }
  }
  if (partial) return partial;
  throw new ResearchError('research_incomplete', `조사 한도 내에 검증된 결과를 확보하지 못했습니다.${context.failures.length ? ` 원문 열람 실패: ${context.failures.map(item => item.code).join(', ')}.` : ''}`);
}
