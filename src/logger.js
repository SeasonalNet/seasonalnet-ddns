'use strict';

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function normalizeLevel(level) {
  const value = String(level || 'info').toLowerCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, value) ? value : 'info';
}

function sanitize(value) {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [REDACTED]')
      .replace(/CF_API_TOKEN=[^\s]+/g, 'CF_API_TOKEN=[REDACTED]')
      .replace(/Authorization:\s*[^\n\r]+/gi, 'Authorization: [REDACTED]');
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (typeof value === 'object') {
    const redacted = {};
    for (const [key, item] of Object.entries(value)) {
      if (/token|authorization|secret|password/i.test(key)) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = sanitize(item);
      }
    }
    return redacted;
  }

  return value;
}

function createLogger(configuredLevel = 'info') {
  const minLevel = normalizeLevel(configuredLevel);

  function write(level, message, meta) {
    const normalized = normalizeLevel(level);
    if (LEVELS[normalized] < LEVELS[minLevel]) return;

    const timestamp = new Date().toISOString();
    let line = `${timestamp} ${normalized.toUpperCase()} ${message}`;

    if (meta !== undefined) {
      const safeMeta = sanitize(meta);
      line += ` ${JSON.stringify(safeMeta)}`;
    }

    const stream = normalized === 'error' ? process.stderr : process.stdout;
    stream.write(`${line}\n`);
  }

  return {
    debug: (message, meta) => write('debug', message, meta),
    info: (message, meta) => write('info', message, meta),
    warn: (message, meta) => write('warn', message, meta),
    error: (message, meta) => write('error', message, meta),
  };
}

module.exports = {
  createLogger,
  sanitize,
};
