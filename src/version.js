'use strict';
const { execFileSync } = require('node:child_process');
const { dirname, join } = require('node:path');
const { existsSync } = require('node:fs');
function softwareVersion() {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    let root = __dirname;
    while (!existsSync(join(root, 'package.json'))) {
      const parent = dirname(root);
      if (parent === root) return '0.0.0+unknown';
      root = parent;
    }
    return execFileSync('sh', [join(root, 'tools/version.sh')], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '0.0.0+unknown';
  }
}
module.exports = { softwareVersion };
