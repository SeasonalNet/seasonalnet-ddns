'use strict';

const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const net = require('node:net');

const execAsync = promisify(exec);

function normalizeDetectedIp(value, family, label = 'IP') {
  const candidate = String(value || '').trim().split(/\s+/)[0] || '';

  if (!candidate) {
    throw new Error(`${label} detection returned an empty result`);
  }

  if (net.isIP(candidate) !== family) {
    const expected = family === 6 ? 'IPv6' : 'IPv4';
    throw new Error(`${label} detection returned a non-${expected} value: ${candidate}`);
  }

  return candidate;
}

function normalizeWanIp(value) {
  return normalizeDetectedIp(value, 4, 'WAN IP');
}

function normalizeWanIpv6(value) {
  return normalizeDetectedIp(value, 6, 'WAN IPv6');
}

async function detectConfiguredIp(config, family, label, logger) {
  if (config.command) {
    logger.debug(`Detecting ${label} using configured command`);
    const { stdout } = await execAsync(config.command, {
      timeout: Number(config.timeout_ms || 15000),
      maxBuffer: 1024 * 64,
      shell: '/bin/sh',
      env: {
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      },
    });
    return normalizeDetectedIp(stdout, family, label);
  }

  if (config.url) {
    logger.debug(`Detecting ${label} using configured HTTP endpoint`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(config.timeout_ms || 15000));
    try {
      const response = await fetch(config.url, {
        signal: controller.signal,
        headers: {
          'user-agent': 'seasonal-cf-ddns/0.1',
        },
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`${label} endpoint returned HTTP ${response.status}: ${body.slice(0, 256)}`);
      }
      return normalizeDetectedIp(body, family, label);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error(`${label} config requires command or url`);
}

async function detectWanIp(config, logger) {
  return detectConfiguredIp(config, 4, 'WAN IP', logger);
}

async function detectWanIpv6(config, logger) {
  return detectConfiguredIp(config, 6, 'WAN IPv6', logger);
}

module.exports = {
  detectConfiguredIp,
  detectWanIp,
  detectWanIpv6,
  normalizeDetectedIp,
  normalizeWanIp,
  normalizeWanIpv6,
};
