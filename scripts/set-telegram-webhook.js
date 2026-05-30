// Usage: node scripts/set-telegram-webhook.js https://YOUR_WORKER.workers.dev
// Sets Telegram's webhook to the Worker URL using .env and clears pending updates.

const { loadEnv, requestTelegram } = require('./telegram-env');

const workerUrl = process.argv[2];
if (!workerUrl) {
  console.error('Missing Worker URL.');
  console.error('Usage: node scripts/set-telegram-webhook.js https://YOUR_WORKER.workers.dev');
  process.exit(1);
}

const env = loadEnv();
if (!env.TELEGRAM_WEBHOOK_SECRET) {
  console.error('Missing TELEGRAM_WEBHOOK_SECRET in .env');
  process.exit(1);
}

requestTelegram('setWebhook', {
  url: workerUrl,
  secret_token: env.TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true
})
  .then(({ statusCode, data }) => {
    console.log('setWebhook HTTP ' + statusCode);
    console.log(JSON.stringify(data, null, 2));
    if (!data.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
