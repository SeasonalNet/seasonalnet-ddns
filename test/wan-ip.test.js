'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeWanIp, normalizeWanIpv6 } = require('../src/wan-ip');

test('accepts IPv4 WAN IP', () => {
  assert.equal(normalizeWanIp('203.0.113.10\n'), '203.0.113.10');
});

test('rejects IPv6 for IPv4 WAN IP detection', () => {
  assert.throws(() => normalizeWanIp('2001:db8::1'), /non-IPv4/);
});

test('accepts IPv6 WAN IP', () => {
  assert.equal(normalizeWanIpv6('2001:db8::10\n'), '2001:db8::10');
});

test('normalizes first whitespace-delimited token from command output', () => {
  assert.equal(normalizeWanIpv6('2001:db8::20 preferred_lft 3600sec\n'), '2001:db8::20');
});

test('rejects IPv4 for IPv6 WAN IP detection', () => {
  assert.throws(() => normalizeWanIpv6('203.0.113.10'), /non-IPv6/);
});

test('rejects invalid text', () => {
  assert.throws(() => normalizeWanIp('not-an-ip'), /non-IPv4/);
  assert.throws(() => normalizeWanIpv6('not-an-ip'), /non-IPv6/);
});
