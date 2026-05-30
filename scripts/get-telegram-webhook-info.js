// Usage: node scripts/get-telegram-webhook-info.js
// Prints Telegram webhook status using .env. Secrets in URLs are masked.

const { requestTelegram, maskWebhookInfo } = require('./telegram-env');

requestTelegram('getWebhookInfo')
  .then(({ statusCode, data }) => {
    console.log('getWebhookInfo HTTP ' + statusCode);
    console.log(JSON.stringify(maskWebhookInfo(data), null, 2));
    if (!data.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
