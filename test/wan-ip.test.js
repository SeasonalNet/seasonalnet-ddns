'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWanIp } = require('../src/wan-ip');

test('accepts IPv4 WAN IP', () => {
  assert.equal(normalizeWanIp('203.0.113.10\n'), '203.0.113.10');
});

test('rejects IPv6 in v1', () => {
  assert.throws(() => normalizeWanIp('2001:db8::1'), /non-IPv4/);
});

test('rejects invalid text', () => {
  assert.throws(() => normalizeWanIp('not-an-ip'), /non-IPv4/);
});
