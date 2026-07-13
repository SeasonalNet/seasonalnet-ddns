#!/usr/bin/env node
'use strict';

const process = require('node:process');
const { loadConfig } = require('./config');
const { CloudflareApiError, CloudflareClient } = require('./cloudflare');
const { createLogger } = require('./logger');
const { detectWanIp, detectWanIpv6 } = require('./wan-ip');
const { buildPatch, classifyRecords, needsUpdate } = require('./record-policy');

function parseArgs(argv) {
  const args = {
    configPath: 'config.yaml',
    dryRun: false,
    once: false,
    checkConfig: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--dry-run') {
      args.dryRun = true;
      args.once = true;
    } else if (arg === '--once') {
      args.once = true;
    } else if (arg === '--check-config') {
      args.checkConfig = true;
      args.once = true;
    } else if (arg === '--config') {
      i += 1;
      if (!argv[i]) throw new Error('--config requires a path');
      args.configPath = argv[i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function usage() {
  return `Usage: node src/index.js [options]\n\nOptions:\n  --config <path>    Config file path. Default: config.yaml\n  --check-config     Validate config and exit.\n  --dry-run          Perform one pass without Cloudflare writes.\n  --once             Perform one live pass and exit.\n  -h, --help         Show help.\n`;
}

function summarizeCloudflareError(error) {
  if (error instanceof CloudflareApiError) {
    return {
      status: error.status,
      body: error.body,
      errors: error.errors,
    };
  }

  return { message: error.message };
}

async function processRecord({ cloudflare, zoneId, recordConfig, desiredContent, dryRun, logger }) {
  const label = `${recordConfig.name} ${recordConfig.type}`;
  logger.info(`Processing ${label} proxied=${recordConfig.proxied}`);

  try {
    const existingRecords = await cloudflare.listRecordsByName(zoneId, recordConfig.name);
    const classification = classifyRecords(existingRecords, recordConfig.type);

    const desiredRecord = {
      type: recordConfig.type,
      name: recordConfig.name,
      content: desiredContent,
      proxied: recordConfig.proxied,
      ttl: recordConfig.ttl,
    };

    if (classification.action === 'create') {
      if (classification.otherType.length > 0) {
        logger.info(`${label} is missing; compatible records with the same hostname will be preserved`, {
          existing_types: classification.otherType.map((record) => record.type),
        });
      }

      if (dryRun) {
        logger.info(`${label} would be created`, {
          content: desiredContent,
          proxied: recordConfig.proxied,
          ttl: recordConfig.ttl || 1,
        });
        return { status: 'changed', detail: 'would-create' };
      }

      await cloudflare.createRecord(zoneId, desiredRecord);
      logger.info(`${label} created`, {
        content: desiredContent,
        proxied: recordConfig.proxied,
        ttl: recordConfig.ttl || 1,
      });
      return { status: 'changed', detail: 'created' };
    }

    if (classification.action === 'skip') {
      logger.warn(`${label} skipped because a blocking DNS record type exists`, {
        blocking_types: classification.blockingType.map((record) => record.type),
      });
      return { status: 'skipped', detail: 'blocking-type-exists' };
    }

    if (classification.action === 'fail') {
      logger.error(`${label} failed because multiple matching records exist`, {
        record_ids: classification.sameType.map((record) => record.id),
      });
      return { status: 'failed', detail: 'multiple-expected-type-records' };
    }

    const existingRecord = classification.record;
    if (!needsUpdate(existingRecord, desiredRecord)) {
      logger.info(`${label} already points to ${desiredContent}; no change`);
      return { status: 'unchanged', detail: 'already-current' };
    }

    const patch = buildPatch(existingRecord, desiredRecord);
    if (dryRun) {
      logger.info(`${label} would be updated`, {
        from_content: existingRecord.content,
        to_content: desiredContent,
        patch,
      });
      return { status: 'changed', detail: 'would-update' };
    }

    await cloudflare.patchRecord(zoneId, existingRecord.id, patch);
    logger.info(`${label} updated`, {
      from_content: existingRecord.content,
      to_content: desiredContent,
      patch,
    });
    return { status: 'changed', detail: 'updated' };
  } catch (error) {
    logger.error(`${label} failed`, summarizeCloudflareError(error));
    return { status: 'failed', detail: error.message };
  }
}

async function runPass({ config, cloudflare, logger, dryRun = false }) {
  const requiredTypes = new Set(config.records.map((record) => record.type));
  const detected = {};

  if (requiredTypes.has('A')) {
    detected.A = await detectWanIp(config.wan_ip, logger);
    logger.info(`Detected WAN IPv4: ${detected.A}`);
  }

  if (requiredTypes.has('AAAA')) {
    detected.AAAA = await detectWanIpv6(config.wan_ipv6, logger);
    logger.info(`Detected WAN IPv6: ${detected.AAAA}`);
  }

  const zoneId = await cloudflare.getZoneIdByName(config.cloudflare.zone_name);
  logger.info(`Using Cloudflare zone ${config.cloudflare.zone_name}: ${zoneId}`);

  const summary = {
    changed: 0,
    unchanged: 0,
    skipped: 0,
    failed: 0,
  };

  for (const recordConfig of config.records) {
    const result = await processRecord({
      cloudflare,
      zoneId,
      recordConfig,
      desiredContent: detected[recordConfig.type],
      dryRun,
      logger,
    });

    if (result.status === 'changed') summary.changed += 1;
    if (result.status === 'unchanged') summary.unchanged += 1;
    if (result.status === 'skipped') summary.skipped += 1;
    if (result.status === 'failed') summary.failed += 1;
  }

  logger.info(
    `DDNS pass complete: changed=${summary.changed} unchanged=${summary.unchanged} skipped=${summary.skipped} failed=${summary.failed}`,
  );

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(usage());
    return;
  }

  const config = loadConfig({ configPath: args.configPath });
  const logger = createLogger(config.logging.level);

  if (args.checkConfig) {
    logger.info(`Config OK: ${args.configPath}`);
    logger.info(`Configured records: ${config.records.length}`);
    return;
  }

  const tokenName = config.cloudflare.api_token_env;
  const apiToken = process.env[tokenName];
  if (!apiToken) {
    throw new Error(`Cloudflare API token environment variable is missing: ${tokenName}`);
  }

  const cloudflare = new CloudflareClient({ apiToken, logger });

  const runAndHandle = async () => {
    try {
      const summary = await runPass({ config, cloudflare, logger, dryRun: args.dryRun });
      if (summary.failed > 0) {
        logger.warn(`DDNS pass completed with record failures: failed=${summary.failed}`);
      }
      return summary;
    } catch (error) {
      logger.error('DDNS pass failed globally', summarizeCloudflareError(error));
      if (args.once || args.dryRun) process.exitCode = 1;
      return null;
    }
  };

  await runAndHandle();

  if (args.once) return;

  const intervalMs = config.interval_seconds * 1000;
  logger.info(`Scheduling DDNS passes every ${config.interval_seconds} seconds`);

  let running = false;
  const timer = setInterval(async () => {
    if (running) {
      logger.warn('Previous DDNS pass is still running; skipping this interval');
      return;
    }

    running = true;
    try {
      await runAndHandle();
    } finally {
      running = false;
    }
  }, intervalMs);

  const shutdown = (signal) => {
    logger.info(`Received ${signal}; shutting down`);
    clearInterval(timer);
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (require.main === module) {
  main().catch((error) => {
    const logger = createLogger('info');
    logger.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  parseArgs,
  processRecord,
  runPass,
};
