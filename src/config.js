'use strict';

const fs = require('node:fs');
const path = require('node:path');

function stripInlineComment(line) {
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const previous = line[i - 1];

    if (ch === "'" && !inDouble) inSingle = !inSingle;
    if (ch === '"' && !inSingle && previous !== '\\') inDouble = !inDouble;

    if (ch === '#' && !inSingle && !inDouble) {
      return line.slice(0, i).trimEnd();
    }
  }

  return line.trimEnd();
}

function parseScalar(rawValue) {
  const value = String(rawValue || '').trim();

  if (value === '') return '';
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    const inner = value.slice(1, -1);
    return value.startsWith('"')
      ? inner.replace(/\\"/g, '"').replace(/\\n/g, '\n')
      : inner.replace(/''/g, "'");
  }

  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d+\.\d+$/.test(value)) return Number.parseFloat(value);

  return value;
}

function splitKeyValue(text, lineNumber) {
  const index = text.indexOf(':');
  if (index === -1) {
    throw new Error(`Invalid YAML line ${lineNumber}: expected key: value`);
  }

  const key = text.slice(0, index).trim();
  const rawValue = text.slice(index + 1).trim();

  if (!key) {
    throw new Error(`Invalid YAML line ${lineNumber}: empty key`);
  }

  return [key, parseScalar(rawValue)];
}

function parseSimpleYaml(source) {
  const root = {};
  let currentSection = null;
  let currentRecord = null;

  const lines = source.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const original = stripInlineComment(lines[i]);
    if (!original.trim()) continue;

    const indentMatch = original.match(/^ */);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const trimmed = original.trim();

    if (indent === 0) {
      currentRecord = null;
      if (trimmed.endsWith(':')) {
        currentSection = trimmed.slice(0, -1).trim();
        root[currentSection] = currentSection === 'records' ? [] : {};
        continue;
      }

      const [key, value] = splitKeyValue(trimmed, lineNumber);
      root[key] = value;
      currentSection = key;
      continue;
    }

    if (!currentSection) {
      throw new Error(`Invalid YAML line ${lineNumber}: nested value without a parent section`);
    }

    if (currentSection === 'records') {
      if (indent === 2 && trimmed.startsWith('- ')) {
        currentRecord = {};
        root.records.push(currentRecord);
        const rest = trimmed.slice(2).trim();
        if (rest) {
          const [key, value] = splitKeyValue(rest, lineNumber);
          currentRecord[key] = value;
        }
        continue;
      }

      if (indent === 4 && currentRecord) {
        const [key, value] = splitKeyValue(trimmed, lineNumber);
        currentRecord[key] = value;
        continue;
      }

      throw new Error(`Invalid YAML line ${lineNumber}: unsupported records indentation`);
    }

    if (indent === 2) {
      const sectionValue = root[currentSection];
      if (!sectionValue || typeof sectionValue !== 'object' || Array.isArray(sectionValue)) {
        throw new Error(`Invalid YAML line ${lineNumber}: parent section is not a map`);
      }

      const [key, value] = splitKeyValue(trimmed, lineNumber);
      sectionValue[key] = value;
      continue;
    }

    throw new Error(`Invalid YAML line ${lineNumber}: unsupported indentation`);
  }

  return root;
}

function assertObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Config field ${name} must be an object`);
  }
}

function validateConfig(config) {
  assertObject(config, 'root');
  assertObject(config.cloudflare, 'cloudflare');
  assertObject(config.wan_ip, 'wan_ip');
  assertObject(config.conflict_policy || {}, 'conflict_policy');
  assertObject(config.logging || {}, 'logging');

  if (!config.cloudflare.zone_name || typeof config.cloudflare.zone_name !== 'string') {
    throw new Error('Config field cloudflare.zone_name is required');
  }

  if (!config.cloudflare.api_token_env || typeof config.cloudflare.api_token_env !== 'string') {
    throw new Error('Config field cloudflare.api_token_env is required');
  }

  if (!config.wan_ip.command && !config.wan_ip.url) {
    throw new Error('Config requires wan_ip.command or wan_ip.url');
  }

  const interval = Number(config.wan_ip.interval_seconds || 600);
  if (!Number.isInteger(interval) || interval < 30) {
    throw new Error('Config field wan_ip.interval_seconds must be an integer >= 30');
  }
  config.wan_ip.interval_seconds = interval;

  if (!Array.isArray(config.records) || config.records.length === 0) {
    throw new Error('Config requires at least one records entry');
  }

  const seen = new Set();
  config.records.forEach((record, index) => {
    const label = `records[${index}]`;
    assertObject(record, label);

    if (!record.name || typeof record.name !== 'string') {
      throw new Error(`Config field ${label}.name is required`);
    }

    record.type = String(record.type || 'A').toUpperCase();
    if (record.type !== 'A') {
      throw new Error(`Config field ${label}.type must be A in v1`);
    }

    if (typeof record.proxied !== 'boolean') {
      throw new Error(`Config field ${label}.proxied must be true or false`);
    }

    if (record.ttl !== undefined) {
      const ttl = Number(record.ttl);
      if (!Number.isInteger(ttl) || ttl < 1) {
        throw new Error(`Config field ${label}.ttl must be an integer >= 1`);
      }
      record.ttl = ttl;
    }

    const uniqueKey = `${record.name.toLowerCase()} ${record.type}`;
    if (seen.has(uniqueKey)) {
      throw new Error(`Duplicate configured record: ${record.name} ${record.type}`);
    }
    seen.add(uniqueKey);
  });

  config.conflict_policy = {
    non_matching_type: 'skip',
    multiple_records: 'fail-record',
    ...(config.conflict_policy || {}),
  };

  if (config.conflict_policy.non_matching_type !== 'skip') {
    throw new Error('Only conflict_policy.non_matching_type=skip is supported in v1');
  }

  if (config.conflict_policy.multiple_records !== 'fail-record') {
    throw new Error('Only conflict_policy.multiple_records=fail-record is supported in v1');
  }

  config.logging = {
    level: 'info',
    ...(config.logging || {}),
  };

  return config;
}

function loadConfig(options = {}) {
  const configPath = options.configPath || path.resolve(process.cwd(), 'config.yaml');
  const raw = fs.readFileSync(configPath, 'utf8');
  const config = parseSimpleYaml(raw);
  return validateConfig(config);
}

module.exports = {
  loadConfig,
  parseSimpleYaml,
  validateConfig,
};
