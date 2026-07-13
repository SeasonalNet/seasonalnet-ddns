'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPatch, classifyRecords, needsUpdate } = require('../src/record-policy');

test('classifies missing records as create', () => {
  const result = classifyRecords([], 'A');
  assert.equal(result.action, 'create');
  assert.equal(result.reason, 'no-records-with-name');
});

test('creates missing AAAA alongside an existing A record', () => {
  const result = classifyRecords([
    { id: '4', type: 'A', content: '203.0.113.10' },
  ], 'AAAA');

  assert.equal(result.action, 'create');
  assert.equal(result.reason, 'missing-expected-type');
});

test('creates missing A alongside an existing AAAA record', () => {
  const result = classifyRecords([
    { id: '6', type: 'AAAA', content: '2001:db8::10' },
  ], 'A');

  assert.equal(result.action, 'create');
  assert.equal(result.reason, 'missing-expected-type');
});

test('creates address records alongside compatible MX and TXT records', () => {
  const result = classifyRecords([
    { id: 'mx', type: 'MX', content: 'mail.seasonalnet.org' },
    { id: 'txt', type: 'TXT', content: 'v=spf1 -all' },
  ], 'AAAA');

  assert.equal(result.action, 'create');
  assert.deepEqual(result.otherType.map((record) => record.type), ['MX', 'TXT']);
});

test('skips creation when a CNAME blocks address records at the hostname', () => {
  const result = classifyRecords([
    { id: 'cname', type: 'CNAME', name: 'grafana.seasonalnet.org' },
  ], 'A');

  assert.equal(result.action, 'skip');
  assert.equal(result.reason, 'blocking-type-exists');
  assert.deepEqual(result.blockingType.map((record) => record.type), ['CNAME']);
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
