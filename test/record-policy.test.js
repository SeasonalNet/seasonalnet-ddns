'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPatch, classifyRecords, needsUpdate } = require('../src/record-policy');

test('classifies missing records as create', () => {
  const result = classifyRecords([], 'A');
  assert.equal(result.action, 'create');
});

test('classifies non-matching type as skip', () => {
  const result = classifyRecords([{ type: 'CNAME', name: 'grafana.seasonalnet.org' }], 'A');
  assert.equal(result.action, 'skip');
  assert.equal(result.reason, 'non-matching-type-exists');
});

test('classifies duplicate expected type as fail', () => {
  const result = classifyRecords([
    { id: '1', type: 'A' },
    { id: '2', type: 'A' },
  ], 'A');
  assert.equal(result.action, 'fail');
});

test('classifies exactly one expected type as update candidate', () => {
  const record = { id: '1', type: 'A', content: '192.0.2.1', proxied: true };
  const result = classifyRecords([record], 'A');
  assert.equal(result.action, 'update');
  assert.equal(result.record, record);
});

test('builds minimal patch for changed content only', () => {
  const existing = { content: '192.0.2.1', proxied: true, ttl: 1 };
  const desired = { content: '192.0.2.2', proxied: true };
  assert.equal(needsUpdate(existing, desired), true);
  assert.deepEqual(buildPatch(existing, desired), { content: '192.0.2.2' });
});

test('builds proxied patch when proxy policy changes', () => {
  const existing = { content: '192.0.2.1', proxied: true, ttl: 1 };
  const desired = { content: '192.0.2.1', proxied: false };
  assert.deepEqual(buildPatch(existing, desired), { proxied: false });
});

test('classifies AAAA records independently from A records with the same name', () => {
  const aaaa = { id: '6', type: 'AAAA', content: '2001:db8::10', proxied: true };
  const result = classifyRecords([
    { id: '4', type: 'A', content: '203.0.113.10', proxied: true },
    aaaa,
  ], 'AAAA');

  assert.equal(result.action, 'update');
  assert.equal(result.record, aaaa);
});
