# Maintenance Scripts

Small one-off scripts for Telegram bot maintenance. They read secrets from the local `.env` file, which is gitignored.

Run from the project root.

## Commands

Test the Cloudflare Worker relay behavior locally:

```sh
node scripts/test-cloudflare-worker.js
```

Scan Worker deployment files for likely committed secrets:

```sh
node scripts/validate-cloudflare-worker-deploy.js
```

Run Cloudflare Worker tests, validate checked-in deployment files, and perform a Wrangler dry run:

```sh
scripts/deploy-cloudflare-worker.sh
```

Publish the Worker after the dry run passes:

```sh
scripts/deploy-cloudflare-worker.sh --apply
```

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
