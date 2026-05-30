# Telegram Invoice Automation

This project creates invoices from Telegram messages.

## Flow

```text
Telegram bot
  -> Cloudflare Worker relay
  -> Google Apps Script Web App
  -> Google Sheet invoice template
  -> PDF export
  -> Telegram PDF reply
```

Cloudflare is required because Apps Script Web Apps return a Google `302` redirect, which Telegram treats as webhook failure.

## Folders

- `apps-script/` - Google Apps Script code, manifest, parser tests, and Apps Script deployment notes.
- `cloudflare-worker/` - Cloudflare Worker relay code and Worker deployment notes.
- `.env` - local checklist/source of truth for config values. Apps Script and Cloudflare do not read this file automatically.
- `.env.example` - public-safe example config.
- `docs/` - private planning and setup notes. This folder is gitignored.

## Service URLs

Keep real service URLs in your private `.env` or private notes. Public docs use placeholders.

Apps Script project URL example:

```text
https://script.google.com/d/YOUR_APPS_SCRIPT_PROJECT_ID/edit
```

Apps Script Web App URL example:

```text
https://script.google.com/macros/s/YOUR_APPS_SCRIPT_DEPLOYMENT_ID/exec
```

Cloudflare Worker URL example:

```text
https://YOUR_WORKER_NAME.YOUR_WORKERS_SUBDOMAIN.workers.dev
```

Telegram webhook should point to the Cloudflare Worker URL, not the Apps Script URL.

## Local Checks

```sh
cd apps-script
node tools/parser-test.js
node tools/validate-env.js
cp Code.gs /private/tmp/telegram_invoice_code_check.js
node --check /private/tmp/telegram_invoice_code_check.js
node -e "JSON.parse(require('fs').readFileSync('appsscript.json','utf8')); console.log('appsscript.json ok')"
```

## Updating Apps Script Code

From `apps-script/`:

```sh
npx @google/clasp push --force
```

Then in Apps Script, update the Web App deployment:

1. `Deploy` -> `Manage deployments`
2. Edit the web app deployment
3. Choose `New version`
4. Keep `Execute as: Me`
5. Keep `Who has access: Anyone`
6. Deploy

If the Web App URL changes, update `APPS_SCRIPT_URL` in the Cloudflare Worker variables.

## Updating Cloudflare Worker Code

Use the source in:

```text
cloudflare-worker/worker.js
```

Deploy it in Cloudflare Dashboard under **Workers & Pages > YOUR_WORKER_NAME > Edit code**.

## Config Locations

Apps Script Script Properties:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_CHAT_IDS` optional
- all sheet/cell/rate properties listed in `apps-script/README.md`

Cloudflare Worker variables:

- `APPS_SCRIPT_URL`
- `TELEGRAM_WEBHOOK_SECRET`

The same `TELEGRAM_WEBHOOK_SECRET` must be used in Apps Script, Cloudflare, and Telegram `setWebhook`.
