import { createHash } from 'node:crypto';
import { officialUrl, normalizeText } from './fetch-source.js';
import { procedureOutput, type Evidence, type ProcedureInput } from '../procedure/schema.js';
import type { Completion, Finding, ResearchContext, Review } from './schema.js';

export function groundFindings(context: ResearchContext, completion: Completion) {
  const findings: Finding[] = [];
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const finding of completion.findings) {
    const source = context.sources.find(item => item.id === finding.sourceId);
    if (keys.has(finding.key)) { errors.push('duplicate_finding_key'); continue; }
    keys.add(finding.key);
    if (!source) { errors.push('source_not_inspected'); continue; }
    try { officialUrl(source.url); } catch { errors.push('unofficial_source'); continue; }
    const quote = normalizeText(finding.quote);
    if (quote.length < 20 || !source.text.includes(quote)) { errors.push('quote_not_in_source'); continue; }
    findings.push({ ...finding, quote });
  }
  return { findings, errors };
}

export function reviewedEvidence(context: ResearchContext, findings: Finding[], review: Review): Evidence[] {
  // Duplicate/omitted review decisions fail closed.
  return findings.flatMap(finding => {
    const verdicts = review.findings.filter(item => item.key === finding.key);
    if (verdicts.length !== 1 || verdicts[0].verdict !== 'supported') return [];
    const source = context.sources.find(item => item.id === finding.sourceId)!;
    const hash = createHash('sha256').update(`${source.url}\n${finding.quote}\n${finding.claim}\n${finding.scope}`).digest('hex').slice(0, 16);
    const host = new URL(source.url).hostname;
    return [{
      id: `evidence-${source.id}-${hash}`,
      institution: host.endsWith('nps.or.kr') ? '국민연금공단' : host.endsWith('law.go.kr') ? '국가법령정보센터' : '정부24 / 정부기관',
      url: source.url, fact: finding.claim, scope: finding.scope,
      verifiedAt: source.retrievedAt.slice(0, 10), retrievedAt: source.retrievedAt,
      sourceId: source.id, quote: finding.quote,
    }];
  });
}

export function validateDraft(input: ProcedureInput, context: ResearchContext, completion: Completion, evidence: Evidence[], review: Review) {
  const errors: string[] = [];
  const draft = completion.draft;
  const byKey = new Map(completion.findings.map(finding => [finding.key,
    evidence.find(item => item.sourceId === finding.sourceId && item.quote === normalizeText(finding.quote)
      && item.fact === finding.claim && item.scope === finding.scope)?.id]));
  const remap = (ids: string[]) => ids.map(key => {
    const id = byKey.get(key);
    if (!id) errors.push('unverified_evidence_reference');
    return id ?? key;
  });
  const checks = draft.checks.map(check => ({ ...check, evidenceIds: remap(check.evidenceIds) }));
  const channels = draft.channels.map(channel => ({ ...channel,
    evidenceIds: remap(channel.evidenceIds),
    cautions: channel.cautions.map(caution => ({ ...caution, evidenceIds: remap(caution.evidenceIds) })),
  }));
  const nextActions = draft.nextActions.map(action => ({ ...action, evidenceIds: remap(action.evidenceIds) }));
  if (new Set(evidence.map(item => item.id)).size !== evidence.length) errors.push('duplicate_evidence');
  if (draft.status === 'needs_verification' && !draft.uncertainties.length) errors.push('uncertainty_required');
  if (!review.draftSupported) errors.push('draft_context_not_supported');
  if (evidence.length !== completion.findings.length) errors.push('unsupported_findings');
  const checkIds = new Set(checks.map(check => check.id));
  const channelIds = new Set(channels.map(channel => channel.id));
  if (checkIds.size !== checks.length || channelIds.size !== channels.length) errors.push('duplicate_reference_id');
  if (draft.status === 'ready' || draft.status === 'not_ready' || nextActions.some(action => action.kind === 'use_channel')) {
    // This input has no independently verified identity/authentication/authority fields.
    errors.push('individual_eligibility_not_established');
  }
  if (draft.status === 'needs_information' && !draft.missingInformation.length) errors.push('missing_questions');
  for (const question of draft.missingInformation) {
    const value = input[question.field];
    if (question.field !== 'goal' && value && value !== 'unknown') errors.push('already_known_user_information');
  }
  for (const check of checks) {
    if (check.outcome !== 'unverified' && !check.evidenceIds.length) errors.push('unsupported_check');
  }
  for (const channel of channels) {
    if (channel.checkIds.some(id => !checkIds.has(id))) errors.push('unknown_check_reference');
    if (!channel.checkIds.some(id => checks.find(check => check.id === id)?.outcome === 'unverified')) errors.push('channel_scope_not_established');
    if (channel.applicationUrl) {
      try {
        const url = officialUrl(channel.applicationUrl).href;
        const channelSources = context.sources.filter(source => channel.evidenceIds.some(id => evidence.find(item => item.id === id)?.sourceId === source.id));
        if (!channelSources.some(source => source.url === url || source.links.includes(url))) errors.push('unobserved_application_url');
      } catch { errors.push('blocked_application_url'); }
    }
  }
  for (const action of nextActions) {
    if (action.channelId !== null && !channelIds.has(action.channelId)) errors.push('unknown_channel_reference');
    if (action.kind === 'prepare' && !action.evidenceIds.length) errors.push('unsupported_preparation');
  }
  const result = { ...draft, checks, channels, nextActions, evidence };
  const parsed = procedureOutput.safeParse(result);
  if (!parsed.success) errors.push('invalid_output_contract');
  return { result, errors: [...new Set(errors)] };
}
