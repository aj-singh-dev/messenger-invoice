# Telegram Invoice Automation

This project creates invoices from Telegram messages.

## Flow

```text
Telegram bot
  -> Cloudflare Worker relay
  -> Google Apps Script Web App
  -> Telegram invoice review
  -> Google Sheet invoice template
  -> PDF export
  -> Telegram PDF reply
```

Cloudflare is required because Apps Script Web Apps return a Google `302` redirect, which Telegram treats as webhook failure.

## Folders

- `apps-script/` - Google Apps Script code, manifest, parser tests, and Apps Script deployment notes.
- `cloudflare-worker/` - Cloudflare Worker relay code and Worker deployment notes.
- `scripts/` - reusable Telegram maintenance scripts.
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

## Supported Invoice Messages

Preferred roster format:

```text
Hi,
18/05 OFF
19/05 OFF
20/05 10:00
21/05 10:00
22/05 11::00
23/05 10:00
24/05 11:00
PLEASE CONFIRM
```

The script infers the invoice period from the dated lines and marks dates with time values as worked. It sends a Telegram review with **Create PDF** and **Cancel** buttons before writing the sheet or exporting the PDF. Unknown statuses such as `PFE` are counted as worked at the normal rate and highlighted in the review.

Invoice numbers are tracked by period in an `Invoice Index` sheet tab so corrections reuse the original invoice number.

Generated PDFs are saved to `DRIVE_OUTPUT_FOLDER_ID` with start-date-based filenames:

```text
YYYY-MM-DD - Workbook Name - Invoice 4.pdf
```

Corrections for an indexed period replace the previously indexed PDF in that folder.

Set email recipients from Telegram with `/email name@example.com other@example.com`. After each PDF is generated from the review, the bot asks whether to email that saved PDF to the configured recipients.

Turn on a weekly Telegram reminder with `/reminder on`. The reminder asks the chat to send the week's working days every Sunday evening.

## Updating Cloudflare Worker Code

Use the source in:

```text
cloudflare-worker/worker.js
```

Deploy it in Cloudflare Dashboard under **Workers & Pages > YOUR_WORKER_NAME > Edit code**.

## Maintenance Scripts

Run from the project root:

```sh
node scripts/get-telegram-webhook-info.js
node scripts/set-telegram-commands.js
node scripts/set-telegram-webhook.js https://YOUR_WORKER_NAME.YOUR_WORKERS_SUBDOMAIN.workers.dev
```

See `scripts/README.md`.

## Config Locations

Apps Script Script Properties:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `TELEGRAM_TEST_MODE` optional, skips audit rows for `TELEGRAM_ADMIN_CHAT_IDS` while testing
- `REMINDER_CHAT_IDS` optional, managed by `/reminder`
- `DRIVE_OUTPUT_FOLDER_ID`
- all sheet/cell/rate properties listed in `apps-script/README.md`

Cloudflare Worker variables:

- `APPS_SCRIPT_URL`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_ALLOWED_CHAT_IDS`
- `TELEGRAM_ADMIN_CHAT_IDS` optional, admin chats are also allowed through the Worker

The same `TELEGRAM_WEBHOOK_SECRET` must be used in Apps Script, Cloudflare, and Telegram `setWebhook`.

Use the same `TELEGRAM_ALLOWED_CHAT_IDS` and `TELEGRAM_ADMIN_CHAT_IDS` in Apps Script and Cloudflare. Cloudflare blocks unknown chats before forwarding to Apps Script; Apps Script keeps the same check as a second layer.
