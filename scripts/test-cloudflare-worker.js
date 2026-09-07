#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const sourcePath = path.join(repoRoot, 'cloudflare-worker', 'worker.js');
  const tempPath = path.join(os.tmpdir(), `telegram-invoice-worker-${Date.now()}.mjs`);

  fs.copyFileSync(sourcePath, tempPath);

  try {
    const worker = (await import(`file://${tempPath}`)).default;
    await testRejectsBadSecret(worker);
    await testAllowsAdminCallback(worker);
    await testBlocksUnknownChat(worker);
    await testNonPostHealthcheck(worker);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }

  console.log('cloudflare worker tests ok');
}

function buildEnv() {
  return {
    APPS_SCRIPT_URL: 'https://script.google.com/macros/s/test-deployment/exec',
    TELEGRAM_WEBHOOK_SECRET: 'test-secret',
    TELEGRAM_ALLOWED_CHAT_IDS: '111',
    TELEGRAM_ADMIN_CHAT_IDS: '222,-100333'
  };
}

function buildCtx(tasks) {
  return {
    waitUntil(promise) {
      tasks.push(promise);
    }
  };
}

function buildTelegramRequest(update, secret = 'test-secret') {
  return new Request('https://telegram-invoice-relay.example.workers.dev', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret
    },
    body: JSON.stringify(update)
  });
}

async function testRejectsBadSecret(worker) {
  const tasks = [];
  const response = await worker.fetch(
    buildTelegramRequest({ message: { chat: { id: 111 } } }, 'wrong-secret'),
    buildEnv(),
    buildCtx(tasks)
  );

  assert.strictEqual(response.status, 403);
  assert.strictEqual(tasks.length, 0);
}

async function testAllowsAdminCallback(worker) {
  const tasks = [];
  const originalFetch = globalThis.fetch;
  const forwardedRequests = [];

  globalThis.fetch = async (url, options) => {
    forwardedRequests.push({ url: String(url), options });
    return new Response('OK', { status: 200 });
  };

  try {
    const response = await worker.fetch(
      buildTelegramRequest({
        callback_query: {
          id: 'callback-id',
          message: {
            chat: { id: -100333 },
            message_id: 10
          },
          data: 'invoice_review:create:token'
        }
      }),
      buildEnv(),
      buildCtx(tasks)
    );

    assert.strictEqual(response.status, 200);
    assert.strictEqual(tasks.length, 1);
    await Promise.all(tasks);
    assert.strictEqual(forwardedRequests.length, 1);
    assert.match(forwardedRequests[0].url, /\?telegram_secret=test-secret$/);
    assert.strictEqual(forwardedRequests[0].options.redirect, 'follow');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function testBlocksUnknownChat(worker) {
  const tasks = [];
  const response = await worker.fetch(
    buildTelegramRequest({ message: { chat: { id: 999 } } }),
    buildEnv(),
    buildCtx(tasks)
  );

  assert.strictEqual(response.status, 200);
  assert.strictEqual(tasks.length, 0);
}

async function testNonPostHealthcheck(worker) {
  const response = await worker.fetch(
    new Request('https://telegram-invoice-relay.example.workers.dev', { method: 'GET' }),
    buildEnv(),
    buildCtx([])
  );

  assert.strictEqual(response.status, 200);
  assert.strictEqual(await response.text(), 'OK');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
