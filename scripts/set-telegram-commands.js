// Usage: node scripts/set-telegram-commands.js
// Registers slash-command suggestions for the Telegram bot using .env.

const { requestTelegram } = require('./telegram-env');

const commands = [
  { command: 'start', description: 'Show invoice request format' },
  { command: 'help', description: 'Show help' },
  { command: 'id', description: 'Show this chat ID' },
  { command: 'version', description: 'Show bot version' },
  { command: 'auth', description: 'Show Google authorization link' }
];

requestTelegram('setMyCommands', { commands })
  .then(({ statusCode, data }) => {
    console.log('setMyCommands HTTP ' + statusCode);
    console.log(JSON.stringify(data, null, 2));
    if (!data.ok) {
      process.exitCode = 1;
    }
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
