'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseSimpleYaml, validateConfig } = require('../src/config');

test('parses expected config model', () => {
  const config = parseSimpleYaml(`
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN

wan_ip:
  command: "curl -fsS https://api.ipify.org"
  interval_seconds: 600

records:
  - name: grafana.seasonalnet.org
    type: A
    proxied: true

  - name: sip.seasonalnet.org
    type: A
    proxied: false

conflict_policy:
  non_matching_type: skip
  multiple_records: fail-record

logging:
  level: info
`);

  assert.equal(config.cloudflare.zone_name, 'seasonalnet.org');
  assert.equal(config.wan_ip.interval_seconds, 600);
  assert.equal(config.records.length, 2);
  assert.equal(config.records[0].name, 'grafana.seasonalnet.org');
  assert.equal(config.records[0].proxied, true);
  assert.equal(config.records[1].proxied, false);
});

test('validates duplicate configured records', () => {
  const config = parseSimpleYaml(`
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN
wan_ip:
  command: "curl -fsS https://api.ipify.org"
  interval_seconds: 600
records:
  - name: grafana.seasonalnet.org
    type: A
    proxied: true
  - name: grafana.seasonalnet.org
    type: A
    proxied: false
conflict_policy:
  non_matching_type: skip
  multiple_records: fail-record
logging:
  level: info
`);

  assert.throws(() => validateConfig(config), /Duplicate configured record/);
});
