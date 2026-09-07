#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required to run Wrangler." >&2
  exit 1
fi

WRANGLER_PACKAGE="${WRANGLER_PACKAGE:-wrangler}"

node scripts/test-cloudflare-worker.js
node scripts/validate-cloudflare-worker-deploy.js

echo "Running Wrangler dry-run..."
npx --yes "$WRANGLER_PACKAGE" deploy --dry-run

if [[ "${1:-}" != "--apply" ]]; then
  echo
  echo "Dry-run complete. Re-run with --apply to deploy:"
  echo "  scripts/deploy-cloudflare-worker.sh --apply"
  exit 0
fi

echo "Deploying Cloudflare Worker..."
npx --yes "$WRANGLER_PACKAGE" deploy
