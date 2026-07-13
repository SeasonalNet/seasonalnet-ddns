'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { processRecord } = require('../src/index');

function createSilentLogger() {
  return {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
}

test('processRecord creates a missing AAAA while preserving an existing A', async () => {
  const calls = [];
  const cloudflare = {
    async listRecordsByName() {
      return [{ id: 'a-record', type: 'A', name: 'mail.seasonalnet.org', content: '203.0.113.10' }];
    },
    async createRecord(zoneId, record) {
      calls.push({ zoneId, record });
    },
  };

  const result = await processRecord({
    cloudflare,
    zoneId: 'zone-1',
    recordConfig: {
      name: 'mail.seasonalnet.org',
      type: 'AAAA',
      proxied: false,
    },
    desiredContent: '2001:db8::25',
    dryRun: false,
    logger: createSilentLogger(),
  });

  assert.deepEqual(result, { status: 'changed', detail: 'created' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].zoneId, 'zone-1');
  assert.deepEqual(calls[0].record, {
    type: 'AAAA',
    name: 'mail.seasonalnet.org',
    content: '2001:db8::25',
    proxied: false,
    ttl: undefined,
  });
});

test('processRecord does not create an address record beside a CNAME', async () => {
  let created = false;
  const cloudflare = {
    async listRecordsByName() {
      return [{ id: 'alias', type: 'CNAME', name: 'mail.seasonalnet.org' }];
    },
    async createRecord() {
      created = true;
    },
  };

  const result = await processRecord({
    cloudflare,
    zoneId: 'zone-1',
    recordConfig: {
      name: 'mail.seasonalnet.org',
      type: 'AAAA',
      proxied: false,
    },
    desiredContent: '2001:db8::25',
    dryRun: false,
    logger: createSilentLogger(),
  });

  assert.deepEqual(result, { status: 'skipped', detail: 'blocking-type-exists' });
  assert.equal(created, false);
});
