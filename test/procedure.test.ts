import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkProcedureReadiness } from '../src/procedure/check.js';
import { verifiedEvidence } from '../src/procedure/data.js';
import { procedureInput, procedureOutput, type ProcedureInput, type ProcedureResult } from '../src/procedure/schema.js';
import { readinessInput } from '../src/mcp.js';

const base: ProcedureInput = {
  procedure: 'national_pension_premium_change', subscriberType: 'voluntary',
  applicant: 'self', changeGoal: 'increase', unavailableChannel: 'phone',
};

function assertIntegrity(result: ProcedureResult) {
  procedureOutput.parse(result);
  const evidenceIds = new Set(result.evidence.map(fact => fact.id));
  const checkIds = new Set(result.checks.map(check => check.id));
  const channelIds = new Set(result.channels.map(channel => channel.id));
  assert.equal(evidenceIds.size, result.evidence.length);
  assert.equal(checkIds.size, result.checks.length);
  assert.equal(channelIds.size, result.channels.length);
  const referenced = new Set<string>();
  const checkReferences = (ids: string[]) => {
    for (const id of ids) { assert.ok(evidenceIds.has(id), `missing evidence ${id}`); referenced.add(id); }
  };
  for (const check of result.checks) {
    checkReferences(check.evidenceIds);
    if (check.outcome !== 'unverified') assert.ok(check.evidenceIds.length);
  }
  for (const channel of result.channels) {
    assert.ok(channel.checkIds.length);
    for (const id of channel.checkIds) assert.ok(checkIds.has(id));
    // Existence must never be mistaken for a completed set of user conditions.
    assert.ok(channel.checkIds.some(id => result.checks.find(check => check.id === id)?.outcome === 'unverified'));
    checkReferences(channel.evidenceIds);
    for (const caution of channel.cautions) checkReferences(caution.evidenceIds);
  }
  for (const action of result.nextActions) {
    if (action.channelId !== null) assert.ok(channelIds.has(action.channelId));
    assert.notEqual(action.kind, 'use_channel');
    checkReferences(action.evidenceIds);
  }
  assert.deepEqual(evidenceIds, referenced, 'only referenced evidence is returned');
  assert.notEqual(result.status, 'ready');
  assert.notEqual(result.status, 'not_ready');
}

test('A: unknown or omitted subscriber type asks first, without applying voluntary rules', () => {
  for (const subscriberType of [undefined, 'unknown'] as const) {
    const result = checkProcedureReadiness({ ...base, subscriberType });
    assert.equal(result.status, 'needs_information');
    assert.deepEqual(result.missingInformation.map(item => item.field), ['subscriberType']);
    assert.deepEqual(result.channels, []);
    assert.deepEqual(result.evidence, []);
    assertIntegrity(result);
  }
});

test('B: self + unavailable phone shows verified alternatives with unresolved conditions', () => {
  const result = checkProcedureReadiness(base);
  assert.equal(result.status, 'needs_verification');
  assert.deepEqual(result.missingInformation, []);
  assert.deepEqual(result.channels.map(channel => channel.type), ['phone', 'online', 'mobile', 'visit']);
  assert.match(result.summary, /법적 신청 불가 판정이 아닙니다/);
  const online = result.channels.find(channel => channel.type === 'online')!;
  assert.equal(online.applicationUrl, 'https://www.nps.or.kr/elctcvlcpt/dclraply/getOHAC0036M0.do');
  assert.ok(online.evidenceIds.includes('NPS-010-01'));
  for (const channel of result.channels.filter(channel => channel.type !== 'online')) assert.equal(channel.applicationUrl, null);
  assert.ok(result.checks.some(check => check.evidenceIds.includes('NPS-009-01') && check.outcome === 'unverified'));
  assert.ok(result.nextActions.some(action => action.channelId === online.id && action.kind === 'verify_official_information'));
  assert.ok(result.nextActions.filter(action => action.channelId).every(action => action.channelId !== 'channel-phone'));
  assert.ok(result.checks.every(check => check.outcome !== 'not_satisfied'));
  assertIntegrity(result);
});

test('C: family request acknowledges proxy provision without granting family authority', () => {
  const result = checkProcedureReadiness({ ...base, applicant: 'family' });
  assert.equal(result.status, 'needs_verification');
  const authority = result.checks.find(check => check.id === 'applicant-authority')!;
  assert.equal(authority.outcome, 'unverified');
  assert.deepEqual(authority.evidenceIds, ['NPS-003-01']);
  assert.ok(result.uncertainties.some(item => item.message.includes('가족')));
  assert.notDeepEqual(result, checkProcedureReadiness(base));
  assertIntegrity(result);
});

test('D: other subscriber types are unsupported before asking irrelevant questions', () => {
  const result = checkProcedureReadiness({ procedure: base.procedure, subscriberType: 'other', applicant: 'self' });
  assert.equal(result.status, 'unsupported');
  assert.deepEqual(result.channels, []);
  assert.deepEqual(result.checks, []);
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.missingInformation, []);
  assert.equal(result.uncertainties[0].code, 'outside_scope');
  assertIntegrity(result);
});

test('missing applicant then direction asks product questions, without inventing requirements', () => {
  const applicant = checkProcedureReadiness({ ...base, applicant: undefined });
  assert.equal(applicant.status, 'needs_information');
  assert.deepEqual(applicant.missingInformation.map(item => item.field), ['applicant']);
  const direction = checkProcedureReadiness({ ...base, changeGoal: undefined });
  assert.equal(direction.status, 'needs_information');
  assert.deepEqual(direction.missingInformation.map(item => item.field), ['changeGoal']);
  assert.equal(checkProcedureReadiness({ ...base, unavailableChannel: undefined }).status, 'needs_verification');
});

test('Zod discriminates strict test/business input and rejects malformed/private/extra fields', () => {
  assert.ok(readinessInput.safeParse({ procedure: 'test' }).success);
  assert.ok(readinessInput.safeParse(base).success);
  assert.ok(procedureInput.safeParse({ procedure: base.procedure }).success);
  for (const invalid of [
    {}, null, [], { procedure: 'other' },
    { ...base, subscriberType: 'employee' }, { ...base, applicant: 'agent' },
    { ...base, changeGoal: 1 }, { ...base, unavailableChannel: 'fax' },
    { ...base, unavailableChannel: ['phone', 'online'] }, { ...base, applicant: null },
    { ...base, name: 'not-collected' }, { procedure: 'test', subscriberType: 'voluntary' },
  ]) assert.equal(readinessInput.safeParse(invalid).success, false);
});

test('all data facts remain verified in docs/sources.md; pending facts cannot enter Evidence', () => {
  const sourceDoc = readFileSync(new URL('../docs/sources.md', import.meta.url), 'utf8');
  const allowed = new Set(sourceDoc.split('\n').filter(line => /^\| NPS-/.test(line) && /\| verified(?: \/| \|)/.test(line))
    .map(line => line.split('|')[1].trim()));
  for (const fact of Object.values(verifiedEvidence)) {
    assert.ok(allowed.has(fact.id), `${fact.id} is not verified in sources.md`);
    assert.equal(fact.verifiedAt, '2026-10-25');
    assert.ok(['nps.or.kr', 'www.nps.or.kr', 'law.go.kr'].includes(new URL(fact.url).hostname));
  }
  const result = checkProcedureReadiness(base);
  for (const fact of result.evidence) assert.ok(allowed.has(fact.id));
});

test('all supported combinations preserve references, no unsafe recommendations or ready', () => {
  for (const subscriberType of [undefined, 'unknown', 'other', 'voluntary'] as const)
    for (const applicant of [undefined, 'unknown', 'self', 'family'] as const)
      for (const changeGoal of [undefined, 'unknown', 'increase', 'decrease'] as const)
        for (const unavailableChannel of [undefined, 'phone', 'online', 'mobile', 'visit'] as const) {
          const input = { procedure: base.procedure, subscriberType, applicant, changeGoal, unavailableChannel };
          const result = checkProcedureReadiness(input);
          assertIntegrity(result);
          const expected = subscriberType === 'other' ? 'unsupported'
            : !subscriberType || subscriberType === 'unknown' || !applicant || applicant === 'unknown'
              || !changeGoal || changeGoal === 'unknown' ? 'needs_information' : 'needs_verification';
          assert.equal(result.status, expected);
          const excluded = result.channels.find(channel => channel.type === unavailableChannel);
          if (excluded) assert.ok(result.nextActions.every(action => action.channelId !== excluded.id));
        }
});

test('pure checker returns independent deterministic results and never mutates input/data', () => {
  const frozen = Object.freeze({ ...base });
  const result = checkProcedureReadiness(frozen);
  const expected = structuredClone(result);
  result.evidence[0].fact = 'changed by caller';
  result.channels[0].checkIds.length = 0;
  assert.deepEqual(checkProcedureReadiness(frozen), expected);
  assert.deepEqual(frozen, base);
});
