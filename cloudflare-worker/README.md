# Cloudflare Worker Telegram Relay

This Worker sits between Telegram and Google Apps Script.

Telegram requires the webhook endpoint to return a direct `200 OK`. Apps Script Web Apps redirect from `script.google.com` to `script.googleusercontent.com`, which Telegram treats as a failed webhook response. The Worker returns `200 OK` immediately, then forwards the update to Apps Script and follows Google's redirect.

## Worker URL

```text
https://YOUR_WORKER_NAME.YOUR_WORKERS_SUBDOMAIN.workers.dev
```

## Files

- `worker.js` - Cloudflare Worker source code.
- `../wrangler.toml` - Wrangler deployment config. It contains no account IDs, service URLs, variables, or secrets.
- `../scripts/test-cloudflare-worker.js` - local Worker behavior tests.
- `../scripts/validate-cloudflare-worker-deploy.js` - pre-deploy scan for accidental committed secrets.
- `../scripts/deploy-cloudflare-worker.sh` - safe local dry-run/deploy wrapper.
- `README.md` - Deployment and maintenance notes.

## Deployment

Preferred local deployment:

```sh
scripts/deploy-cloudflare-worker.sh
```

That runs the Worker tests, scans checked-in Worker deployment files for likely leaked values, and runs `wrangler deploy --dry-run`.

To publish after the dry run passes:

```sh
scripts/deploy-cloudflare-worker.sh --apply
```

Use Wrangler auth from your local machine, either `npx wrangler login` or a local `CLOUDFLARE_API_TOKEN` environment variable. Do not commit Cloudflare credentials, account IDs, real Apps Script URLs, Telegram tokens, webhook secrets, `.env*`, or `.dev.vars*` files. Do not put those values in GitHub Actions unless there is a specific reason to move deployment into CI.

Manual dashboard deployment is still available:

1. Open Cloudflare Dashboard.
2. Go to **Workers & Pages**.
3. Open your Worker.
4. Click **Edit code**.
5. Replace the Worker source with `worker.js`.
6. Click **Save and deploy**.

## Required Worker Secrets

Set these in Cloudflare under **Worker > Settings > Variables and Secrets** as **Secret** values:

```text
APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_APPS_SCRIPT_DEPLOYMENT_ID/exec
TELEGRAM_WEBHOOK_SECRET=<same value as Apps Script TELEGRAM_WEBHOOK_SECRET>
TELEGRAM_ALLOWED_CHAT_IDS=123456789,-1001234567890
TELEGRAM_ADMIN_CHAT_IDS=123456789
```

`APPS_SCRIPT_URL` should be the Apps Script Web App `/exec` URL, without `?telegram_secret=...`. The Worker appends that query parameter itself.

`TELEGRAM_ALLOWED_CHAT_IDS` is required for the actual user. `TELEGRAM_ADMIN_CHAT_IDS` is optional; admin chats are also allowed automatically. Rejected updates return `200 OK` to Telegram but are not forwarded to Apps Script.

The secret names are declared in `wrangler.toml` under `[secrets].required`, but the values are intentionally not stored there. Wrangler validates that these secrets exist before deployment.

## Telegram Webhook

Telegram should point to the Worker URL, not the Apps Script URL.

```sh
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://YOUR_WORKER_NAME.YOUR_WORKERS_SUBDOMAIN.workers.dev",
    "secret_token": "'"$TELEGRAM_WEBHOOK_SECRET"'",
      "allowed_updates": ["message", "callback_query"],
    "drop_pending_updates": true
  }'
```

Verify:

```sh
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getWebhookInfo"
```

Expected healthy state:

```json
{
  "ok": true,
  "result": {
    "url": "https://YOUR_WORKER_NAME.YOUR_WORKERS_SUBDOMAIN.workers.dev",
    "pending_update_count": 0,
    "allowed_updates": ["message", "callback_query"]
  }
}
```

## Why This Exists

Do not set Telegram's webhook directly to Apps Script. Apps Script Web Apps return a `302` redirect to `script.googleusercontent.com`; Telegram reports that as `Wrong response from the webhook: 302 Moved Temporarily`.

The Worker fixes this by returning `200 OK` directly to Telegram, then forwarding allowed updates to Apps Script with `redirect: 'follow'`.
