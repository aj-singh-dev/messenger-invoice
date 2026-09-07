#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

const secretPatterns = [
  {
    name: 'Telegram bot token',
    pattern: /\b\d{6,}:[A-Za-z0-9_-]{25,}\b/
  },
  {
    name: 'Cloudflare API token',
    pattern: /\bCLOUDFLARE_(?:API_TOKEN|API_KEY)\s*[:=]\s*['"]?[A-Za-z0-9_-]{20,}/
  },
  {
    name: 'Apps Script deployment URL',
    pattern: /https:\/\/script\.google\.com\/macros\/s\/(?!YOUR_|test-deployment)[A-Za-z0-9_-]+\/exec/
  },
  {
    name: 'Cloudflare account id',
    pattern: /\b[0-9a-f]{32}\b/i
  }
];

let failed = false;

for (const file of listGitVisibleFiles()) {
  const absolutePath = path.join(repoRoot, file);
  if (!fs.existsSync(absolutePath)) {
    continue;
  }

  const buffer = fs.readFileSync(absolutePath);
  if (isBinary(buffer)) {
    continue;
  }

  const contents = buffer.toString('utf8');
  for (const { name, pattern } of secretPatterns) {
    if (pattern.test(contents)) {
      console.error(`Potential ${name} found in ${file}. Keep real values in Cloudflare variables or local env only.`);
      failed = true;
    }
  }
}

if (failed) {
  process.exit(1);
}

console.log('cloudflare deploy validation ok');

function listGitVisibleFiles() {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    cwd: repoRoot,
    encoding: 'utf8'
  });

  return output
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isBinary(buffer) {
  return buffer.includes(0);
}
