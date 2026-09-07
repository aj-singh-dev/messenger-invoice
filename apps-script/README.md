# Apps Script Implementation

This folder contains the Google Apps Script invoice automation.

It runs as a Google Apps Script Web App behind the Cloudflare Worker relay in `../cloudflare-worker`. Telegram sends bot updates to Cloudflare, Cloudflare forwards them to `doPost(e)`, the script parses the invoice request, sends a review prompt with inline buttons, and only creates the PDF after the user taps **Create PDF**.

Telegram should not point directly at the Apps Script URL. Apps Script Web Apps respond with a Google redirect, which Telegram treats as webhook failure. The Cloudflare Worker returns a direct `200 OK` to Telegram and follows the Apps Script redirect.

## Files

- `Code.gs` - Telegram webhook handlers, parser, Google Sheet update/export, Telegram send helpers.
- `Config.gs` - shared constants and property names.
- `Telegram.gs` - Telegram update extraction, command handling helpers, and Telegram API calls.
- `Parser.gs` - invoice request parsing for both week/day format and dated roster format.
- `InvoiceIndex.gs` - period-to-invoice-number index logic.
- `InvoiceReview.gs` - pending invoice review storage, review summary text, and Create PDF/Cancel callback handling.
- `Sheets.gs` - Google Sheet writes and PDF export.
- `Email.gs` - per-chat email recipient state, send confirmation buttons, and PDF email delivery.
- `Reminder.gs` - weekly Telegram reminder subscriptions and time trigger management.
- `Utils.gs` - logging, cache, property, response, and date helpers.
- `appsscript.json` - Apps Script manifest and OAuth scopes.
- `.clasp.example.json` - Public-safe example for linking this folder to an Apps Script project.
- `.clasp.json` - Local-only clasp config. This file is gitignored because it contains your Apps Script project ID.
- `.claspignore` - Ensures Apps Script source files and `appsscript.json` are pushed by `clasp`.
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
TELEGRAM_ALLOWED_CHAT_IDS=123456789,-1001234567890
SPREADSHEET_ID=...
DRIVE_OUTPUT_FOLDER_ID=...
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
VAT_RATE_PERCENT=20
LAST_INVOICE_NUMBER=...
```

Optional:

```text
TELEGRAM_ADMIN_CHAT_IDS=123456789
TELEGRAM_TEST_MODE=false
```

`VAT_RATE_PERCENT` is optional. If it is missing, the Telegram review preview uses `20`.

`TELEGRAM_ALLOWED_CHAT_IDS` is required for the actual user. Admin chats listed in `TELEGRAM_ADMIN_CHAT_IDS` are also allowed automatically. Use the same allowlist/admin values in Cloudflare Worker variables so unknown chats are blocked before they reach Apps Script.

If `TELEGRAM_ADMIN_CHAT_IDS` is set, those chats can use `/auth` to request a Google authorization URL. Keep this restricted to the developer/admin chat.

Set `TELEGRAM_TEST_MODE=true` while testing if you do not want admin chat activity written to the `Invoice Runs` audit sheet. Only chats listed in `TELEGRAM_ADMIN_CHAT_IDS` can skip audit rows.

## Telegram Message Format

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

The parser treats `OFF` as not worked and any time-like value such as `10:00` or `11::00` as worked. Unknown statuses such as `PFE` are counted as worked at the normal rate and highlighted for review. It infers the full Monday-to-Sunday invoice week around roster dates, so omitting an OFF day does not create a different period. Dates without a year use the current year.

The older explicit week/day format is still supported:

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

## Invoice Numbering

Invoice numbers are resolved through an `Invoice Index` sheet tab.

- If the invoice period already exists in `Invoice Index`, the script reuses that invoice number.
- If the invoice period already exists and the message includes a different invoice number, the script stops and asks you to check the number instead of silently choosing one.
- If the message includes an explicit invoice number for a new period, the script writes it to `Invoice Index` only if that invoice number is not already used by another period.
- If the invoice period is newer than the latest indexed period, the script reserves the highest invoice number in `Invoice Index` plus one, writes the period to `Invoice Index`, and updates `LAST_INVOICE_NUMBER` as a fallback.
- If the index is empty, or the message is for an older unindexed period, the script refuses to guess and asks for an explicit invoice number once.

This prevents corrections to older weeks from accidentally incrementing the invoice sequence.

The `Invoice Index` tab also stores the saved PDF's Drive file ID and filename. Corrections for an indexed period replace the previous indexed PDF inside `DRIVE_OUTPUT_FOLDER_ID`.

## Invoice Review

Pasting or forwarding a rota now creates a review message first. The review shows the invoice number, week, OFF count, each day, any amount overrides, uncertain statuses, subtotal, VAT, and total.

The user can tap:

- **Create PDF** - writes the Google Sheet template, exports the PDF, saves it to Drive, sends it in Telegram, and offers email sending.
- **Change day** - asks which weekday to change, then uses a Telegram reply prompt for `OFF`, a time such as `05:00`, or an amount such as `75`.
- **Change invoice number** - asks for the invoice number to use and validates it against the `Invoice Index`.
- **Cancel** - clears the pending review without creating a PDF.

Pending reviews are stored in Apps Script `CacheService` for up to six hours. If a review expires, paste the rota again.

## PDF Saving

Generated PDFs are saved into the configured Drive folder:

```text
DRIVE_OUTPUT_FOLDER_ID=...
```

Filenames use the invoice period start date, workbook name, and invoice number:

```text
YYYY-MM-DD - Workbook Name - Invoice 4.pdf
```

The code only creates and replaces PDFs inside `DRIVE_OUTPUT_FOLDER_ID`. If an indexed Drive file ID no longer belongs to that folder, the script refuses to replace it.

Creating and trashing files requires the Apps Script manifest to use the Drive write scope:

```text
https://www.googleapis.com/auth/drive
```

Email sending requires the Apps Script send-mail scope:

```text
https://www.googleapis.com/auth/script.send_mail
```

Creating Gmail drafts with PDF attachments requires:

```text
https://mail.google.com/
```

Weekly reminders create an Apps Script time trigger and require:

```text
https://www.googleapis.com/auth/script.scriptapp
```

The bot also supports:

- `/start` - returns the expected invoice request format.
- `/help` - returns the same help text as `/start`.
- `/id` - returns the Telegram chat ID for allowlisting.
- `/email` - shows, sets, or clears the email recipient for this chat.
- `/reminder` - shows, enables, or disables weekly Telegram reminders for this chat.
- `/version` - returns the deployed bot version.
- `/auth` - admin-only Google authorization link.

## Email Sending

Set the email recipient from Telegram:

```text
/email name@example.com
```

Set multiple recipients:

```text
/email first@example.com second@example.com
```

Show the current recipient:

```text
/email
```

Clear it:

```text
/email clear
```

Email options are hidden by default. To show the post-PDF email buttons, set:

```text
EMAIL_OPTIONS_ENABLED=true
```

When enabled, after every generated PDF, the bot asks how to email it and shows the recipient list and invoice filename.

- **Create Gmail draft** creates a draft in the deploying user's Gmail account with the saved PDF attached. Review and send it manually from Gmail. This is the preferred option when direct automated mail is likely to look less trustworthy to the recipient.
- **Send directly** emails the saved Drive PDF attachment immediately through Apps Script.
- **Skip** dismisses the prompt.

Optional script property:

```text
EMAIL_SENDER_NAME=Invoice Sender
```

When set, Apps Script asks Google to use this display name on outgoing invoice emails.

Optional manual-send property:

```text
EMAIL_MANUAL_DRIVE_LINK_ENABLED=false
```

When set to `true`, the **Manual send** button shares the saved invoice PDF as view-only to anyone with the link and adds an **Open PDF** button. This is useful on iPhone when Telegram will not preview the PDF until it is downloaded. Leave it disabled if you do not want invoice PDFs exposed by link.

If the bot reports that authorization is required after this feature is deployed, send `/auth` from an admin chat and approve the updated Gmail permission.

## Weekly Reminders

Turn on a Sunday evening reminder for the current Telegram chat:

```text
/reminder on
```

Check reminder status:

```text
/reminder
```

Turn it off:

```text
/reminder off
```

The first `/reminder on` creates an Apps Script weekly time trigger for `sendWeeklyInvoiceReminders`. Reminder chat IDs are stored in the `REMINDER_CHAT_IDS` script property.

## Google Sheet Requirements

The sheet needs:

- One input/calculation tab identified by `INPUT_SHEET_NAME`.
- One PDF/export tab identified by `INVOICE_SHEET_NAME`.
- Input cells for invoice number, period start, period end, and day-rate cells.
- An `Invoice Index` tab will be created automatically if it does not exist.

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
7. Run `testAuthorizeDriveOutputFolder` once in Apps Script after setting `DRIVE_OUTPUT_FOLDER_ID`. This creates and immediately trashes a small test file in the configured folder so Google prompts for Drive write authorization.
8. Deploy or update the Web App:
   - Execute as: `Me`
   - Who has access: `Anyone`
9. Copy the Web App URL.
10. Set `APPS_SCRIPT_URL` in Cloudflare Worker variables to that Web App URL.
11. Set Telegram's webhook to the Cloudflare Worker URL, not the Apps Script URL. See `../cloudflare-worker/README.md`.
12. Send `/start` to the bot.
13. Send `/id` and optionally add the returned chat ID to `TELEGRAM_ALLOWED_CHAT_IDS`.
14. Seed `Invoice Index` once if needed by sending the first historical/correction message with an explicit invoice number.
15. Paste the smoke-test invoice request and confirm the sheet updates and the bot replies with the PDF.

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
