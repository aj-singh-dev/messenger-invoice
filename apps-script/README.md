# Apps Script Implementation

This folder contains the Google Apps Script invoice automation.

It runs as a Google Apps Script Web App behind the Cloudflare Worker relay in `../cloudflare-worker`. Telegram sends bot updates to Cloudflare, Cloudflare forwards them to `doPost(e)`, the script parses the invoice request, updates the Google Sheet template, exports the invoice tab as a PDF, and replies in Telegram with the generated PDF.

Telegram should not point directly at the Apps Script URL. Apps Script Web Apps respond with a Google redirect, which Telegram treats as webhook failure. The Cloudflare Worker returns a direct `200 OK` to Telegram and follows the Apps Script redirect.

## Files

- `Code.gs` - Telegram webhook handlers, parser, Google Sheet update/export, Telegram send helpers.
- `appsscript.json` - Apps Script manifest and OAuth scopes.
- `.clasp.example.json` - Public-safe example for linking this folder to an Apps Script project.
- `.clasp.json` - Local-only clasp config. This file is gitignored because it contains your Apps Script project ID.
- `.claspignore` - Ensures only `Code.gs` and `appsscript.json` are pushed by `clasp`.
- `tools/parser-test.js` - local Node test runner for parser and Telegram update extraction behavior.
- `tools/validate-env.js` - local `.env` structure checker.

## Apps Script URLs

Use placeholders in public docs. Keep real URLs in your private `.env` or private notes.

```text
Project: https://script.google.com/d/YOUR_APPS_SCRIPT_PROJECT_ID/edit
Web App: https://script.google.com/macros/s/YOUR_APPS_SCRIPT_DEPLOYMENT_ID/exec
```

## Required Script Properties

Set these in Apps Script under **Project Settings > Script Properties**.

```text
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=choose-a-secret-string
SPREADSHEET_ID=...
INPUT_SHEET_NAME=...
INVOICE_SHEET_NAME=...
INVOICE_NUMBER_CELL=...
PERIOD_START_CELL=...
PERIOD_END_CELL=...
MONDAY_CELL=...
TUESDAY_CELL=...
WEDNESDAY_CELL=...
THURSDAY_CELL=...
FRIDAY_CELL=...
SATURDAY_CELL=...
SUNDAY_CELL=...
WEEKDAY_RATE=...
WEEKEND_RATE=...
LAST_INVOICE_NUMBER=...
```

Optional:

```text
TELEGRAM_ALLOWED_CHAT_IDS=123456789,-1001234567890
```

If `TELEGRAM_ALLOWED_CHAT_IDS` is set, only those Telegram chats can use the bot. Send `/id` to the bot to get the current chat ID.

## Telegram Message Format

```text
Invoice week 2026-05-11 to 2026-05-17
Worked: Mon Tue Wed Thu Fri Sat Sun
```

Optional invoice number:

```text
Invoice 1042
Week 2026-05-11 to 2026-05-17
Worked: Mon Wed Sat Sun
```

If the invoice number is missing, the script uses `LAST_INVOICE_NUMBER + 1` and updates `LAST_INVOICE_NUMBER` when reserving the number.

The bot also supports:

- `/start` - returns the expected invoice request format.
- `/id` - returns the Telegram chat ID for allowlisting.

## Google Sheet Requirements

The sheet needs:

- One input/calculation tab identified by `INPUT_SHEET_NAME`.
- One PDF/export tab identified by `INVOICE_SHEET_NAME`.
- Input cells for invoice number, period start, period end, and day-rate cells.

`INPUT_SHEET_NAME` and `INVOICE_SHEET_NAME` can be either tab names or numeric Google Sheets `gid` values.

The day cells receive the configured rate when worked and are cleared when not worked:

- Monday to Friday use `WEEKDAY_RATE`.
- Saturday and Sunday use `WEEKEND_RATE`.

If `PERIOD_START_CELL` and `PERIOD_END_CELL` are the same cell, the script writes one period string like `11/05/2026 - 17/05/2026`. If they are different cells, it writes actual date values into each cell.

## Deployment Steps

1. Create the bot with Telegram BotFather and copy the bot token.
2. Update `Code.gs` and `appsscript.json` locally.
3. Create a local `.clasp.json` from `.clasp.example.json` and set `scriptId` to your Apps Script project ID.
4. Push code to Apps Script:

```sh
npx @google/clasp push --force
```

5. Set all required Script Properties manually in Apps Script under **Project Settings > Script Properties**.
6. Run `testParseInvoiceRequest` once in Apps Script to authorize the script and test the parser.
7. Deploy or update the Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
8. Copy the Web App URL.
9. Set `APPS_SCRIPT_URL` in Cloudflare Worker variables to that Web App URL.
10. Set Telegram's webhook to the Cloudflare Worker URL, not the Apps Script URL. See `../cloudflare-worker/README.md`.
11. Send `/start` to the bot.
12. Send `/id` and optionally add the returned chat ID to `TELEGRAM_ALLOWED_CHAT_IDS`.
13. Paste the smoke-test invoice request and confirm the sheet updates and the bot replies with the PDF.

## Webhook Secret Note

Telegram sends `secret_token` as the `X-Telegram-Bot-Api-Secret-Token` header to the Cloudflare Worker. The Worker validates it, forwards the update to Apps Script, and appends `?telegram_secret=...` so Apps Script can validate the same secret.

## Local Checks

From this folder:

```sh
node tools/parser-test.js
node tools/validate-env.js
cp Code.gs /private/tmp/telegram_invoice_code_check.js
node --check /private/tmp/telegram_invoice_code_check.js
node -e "JSON.parse(require('fs').readFileSync('appsscript.json','utf8')); console.log('appsscript.json ok')"
```

The local `.env` file is only a source-of-truth checklist for setup. Apps Script cannot read it directly after deployment, so these values still need to be copied into Apps Script Script Properties.

## Current Limitations

- Only Telegram `message` updates with `text` or `caption` are handled.
- Natural language parsing is intentionally limited.
- Duplicate update protection uses Apps Script cache for six hours.
- PDF export options may need tuning against the real invoice sheet layout.
