'use strict';

const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const net = require('node:net');

const execAsync = promisify(exec);

function normalizeWanIp(value) {
  const candidate = String(value || '').trim();

  if (!candidate) {
    throw new Error('WAN IP detection returned an empty result');
  }

  if (net.isIP(candidate) !== 4) {
    throw new Error(`WAN IP detection returned a non-IPv4 value: ${candidate}`);
  }

  return candidate;
}

async function detectWanIp(config, logger) {
  if (config.command) {
    logger.debug('Detecting WAN IP using configured command');
    const { stdout } = await execAsync(config.command, {
      timeout: Number(config.timeout_ms || 15000),
      maxBuffer: 1024 * 64,
      shell: '/bin/sh',
      env: {
        PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      },
    });
    return normalizeWanIp(stdout);
  }

  if (config.url) {
    logger.debug('Detecting WAN IP using configured HTTP endpoint');
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
        throw new Error(`WAN IP endpoint returned HTTP ${response.status}: ${body.slice(0, 256)}`);
      }
      return normalizeWanIp(body);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new Error('WAN IP config requires command or url');
}

module.exports = {
  detectWanIp,
  normalizeWanIp,
};
