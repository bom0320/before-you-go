import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getInputResolution } from '../src/procedure/check.js';
import { procedureInput, procedureOutput } from '../src/procedure/schema.js';
import { readinessInput } from '../src/mcp.js';
import { businessInput } from './research-fixtures.js';

test('unknown subscriber asks first; other is unsupported without applying voluntary rules', () => {
  const unknown = getInputResolution({ procedure: businessInput.procedure });
  assert.equal(unknown?.status, 'needs_information');
  assert.deepEqual(unknown?.missingInformation.map(item => item.field), ['subscriberType']);
  assert.deepEqual(unknown?.channels, []);
  assert.deepEqual(unknown?.evidence, []);
  const other = getInputResolution({ ...businessInput, subscriberType: 'other' });
  assert.equal(other?.status, 'unsupported');
  assert.deepEqual(other?.checks, []);
  procedureOutput.parse(unknown); procedureOutput.parse(other);
});
test('questions never re-ask known applicant or goal; explicit lookup intent can reach agent', () => {
  assert.equal(getInputResolution({ ...businessInput, applicant: 'unknown' })?.missingInformation[0].field, 'applicant');
  assert.equal(getInputResolution({ ...businessInput, changeGoal: 'unknown' })?.missingInformation[0].field, 'changeGoal');
  assert.equal(getInputResolution(businessInput), undefined);
  assert.equal(getInputResolution({ procedure: businessInput.procedure, goal: '가입 유형을 확인하는 공식 방법을 알아보고 싶다' }), undefined);
});
test('strict Zod input preserves test mode and structured fields; goal is bounded', () => {
  assert.ok(readinessInput.safeParse({ procedure: 'test' }).success);
  assert.ok(procedureInput.safeParse({ ...businessInput, goal: '전화가 안 된다' }).success);
  for (const invalid of [
    {}, null, [], { procedure: 'other' }, { ...businessInput, subscriberType: 'employee' },
    { ...businessInput, applicant: 'agent' }, { ...businessInput, changeGoal: 1 },
    { ...businessInput, unavailableChannel: 'fax' }, { ...businessInput, goal: 'x'.repeat(301) },
    { ...businessInput, applicant: null }, { ...businessInput, name: 'not-collected' },
    { procedure: 'test', goal: 'not-allowed' },
  ]) assert.equal(readinessInput.safeParse(invalid).success, false);
});
