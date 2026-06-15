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


test('validates mixed A and AAAA records when wan_ipv6 is configured', () => {
  const config = parseSimpleYaml(`
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN
wan_ip:
  command: "curl -fsS https://api.ipify.org"
  interval_seconds: 600
wan_ipv6:
  command: "ip -6 -o addr show dev ens18 scope global | awk '!/temporary|deprecated/ { split($4,a,\"/\"); print a[1]; exit }'"
records:
  - name: www.seasonalnet.org
    type: A
    proxied: true
  - name: www.seasonalnet.org
    type: AAAA
    proxied: true
conflict_policy:
  non_matching_type: skip
  multiple_records: fail-record
logging:
  level: info
`);

  const validated = validateConfig(config);
  assert.equal(validated.records[0].type, 'A');
  assert.equal(validated.records[1].type, 'AAAA');
});

test('requires wan_ipv6 when AAAA records are configured', () => {
  const config = parseSimpleYaml(`
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN
wan_ip:
  command: "curl -fsS https://api.ipify.org"
  interval_seconds: 600
records:
  - name: www.seasonalnet.org
    type: AAAA
    proxied: true
conflict_policy:
  non_matching_type: skip
  multiple_records: fail-record
logging:
  level: info
`);

  assert.throws(() => validateConfig(config), /requires wan_ipv6/);
});

test('rejects unsupported record types', () => {
  const config = parseSimpleYaml(`
cloudflare:
  zone_name: seasonalnet.org
  api_token_env: CF_API_TOKEN
wan_ip:
  command: "curl -fsS https://api.ipify.org"
  interval_seconds: 600
records:
  - name: www.seasonalnet.org
    type: CNAME
    proxied: true
conflict_policy:
  non_matching_type: skip
  multiple_records: fail-record
logging:
  level: info
`);

  assert.throws(() => validateConfig(config), /must be A or AAAA/);
});
