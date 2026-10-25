import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zodTextFormat } from 'openai/helpers/zod';
import { modelDecisionSchema, decisionSchema, reviewSchema, toResearchDecision, type ResearchContext } from '../src/research/schema.js';
import { businessInput, fixtureCompletion, fixtureText } from './research-fixtures.js';

const context: ResearchContext = { input: businessInput, candidates: [], sources: [{ id: 'source-1', url: 'https://nps.or.kr/test', text: fixtureText, links: [], retrievedAt: '2026-10-25T00:00:00.000Z' }], failures: [], feedback: [], remaining: { rounds: 1, searches: 0, inspections: 0 } };
const empty = { queries: [], sourceIds: [], findings: [], draft: null, questions: [] };

test('generated model schemas use required strict objects and supported nullable branches', () => {
  const original = zodTextFormat(decisionSchema, 'original').schema as any;
  assert.equal(original.properties.decision.anyOf.length, 4);
  assert.equal(original.properties.decision.anyOf[2].properties.draft.properties.channels.items.properties.applicationUrl.anyOf[0].format, 'uri');
  for (const schema of [modelDecisionSchema, reviewSchema]) {
    const format = zodTextFormat(schema, 'test');
    assert.equal(format.strict, true);
    assert.equal(format.schema.type, 'object');
    assert.ok(!('anyOf' in format.schema));
    function visit(value: any) {
      if (!value || typeof value !== 'object') return;
      assert.ok(!('oneOf' in value) && !('allOf' in value));
      assert.notEqual(value.format, 'uri');
      if (value.type === 'object') {
        assert.equal(value.additionalProperties, false);
        assert.deepEqual([...value.required].sort(), Object.keys(value.properties).sort());
      }
      if (value.anyOf) {
        // Retain supported nested nullable values; no decision union on the wire.
        assert.equal(value.anyOf.length, 2);
        assert.ok(value.anyOf.some((branch: any) => branch.type === 'null'));
      }
      for (const child of Object.values(value)) visit(child);
    }
    visit(format.schema);
  }
  const wire = zodTextFormat(modelDecisionSchema, 'decision').schema as any;
  assert.deepEqual(wire.required, ['type', 'queries', 'sourceIds', 'findings', 'draft', 'questions']);
});

test('flat model output converts all four branches into the existing internal decision union', () => {
  const questions = [{ field: 'subscriberType' as const, question: '가입 유형은 무엇인가요?' }];
  const complete = fixtureCompletion(context);
  for (const [wire, expected] of [
    [{ ...empty, type: 'search', queries: ['query'] }, { type: 'search', queries: ['query'] }],
    [{ ...empty, type: 'inspect', sourceIds: ['source-1'] }, { type: 'inspect', sourceIds: ['source-1'] }],
    [{ ...empty, ...complete }, complete],
    [{ ...empty, type: 'needs_information', questions }, { type: 'needs_information', questions }],
  ]) assert.deepEqual(toResearchDecision(wire), expected);
});

test('conversion preserves branch limits, required fields, HTTPS checks and unused-field consistency', () => {
  for (const type of ['search', 'inspect', 'complete', 'needs_information']) assert.throws(() => toResearchDecision({ ...empty, type }));
  assert.throws(() => toResearchDecision({ type: 'search', queries: ['query'] }));
  assert.throws(() => toResearchDecision({ ...empty, type: 'search', queries: ['query'], sourceIds: ['source-1'] }));
  assert.throws(() => toResearchDecision({ ...empty, type: 'inspect', sourceIds: ['source-1'], questions: [{ field: 'goal', question: 'why?' }] }));
  const complete = fixtureCompletion(context);
  complete.draft.channels[0].applicationUrl = 'http://nps.or.kr/insecure';
  assert.ok(modelDecisionSchema.safeParse({ ...empty, ...complete }).success);
  assert.throws(() => toResearchDecision({ ...empty, ...complete }));
  assert.throws(() => toResearchDecision({ ...empty, type: 'search', queries: Array(5).fill('query') }));
});
