# Maintenance Scripts

Small one-off scripts for Telegram bot maintenance. They read secrets from the local `.env` file, which is gitignored.

Run from the project root.

## Commands

Register slash-command suggestions:

```sh
node scripts/set-telegram-commands.js
```

Set Telegram webhook to the Cloudflare Worker and clear pending updates:

```sh
node scripts/set-telegram-webhook.js https://YOUR_WORKER_NAME.YOUR_WORKERS_SUBDOMAIN.workers.dev
```

Check Telegram webhook status:

```sh
node scripts/get-telegram-webhook-info.js
```
