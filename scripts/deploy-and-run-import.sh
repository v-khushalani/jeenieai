#!/usr/bin/env bash
set -euo pipefail

# Usage:
# 1) Install Supabase CLI: https://supabase.com/docs/guides/cli
# 2) Login: supabase login
# 3) Set env vars: export SUPABASE_PROJECT_REF=your-ref
#                export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
# 4) Run: ./scripts/deploy-and-run-import.sh

REF=${SUPABASE_PROJECT_REF:-}
if [ -z "$REF" ]; then
  echo "SUPABASE_PROJECT_REF not set. Set it and rerun."
  exit 1
fi

echo "Deploying edge functions to project $REF..."

for fn in ensure-user-profile hf-dataset-importer utils/reset-database; do
  echo "Deploying $fn..."
  supabase functions deploy "$fn" --project-ref "$REF" --no-verify
done

echo "All functions deployed. Invoking hf-dataset-importer to start import..."

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "Warning: SUPABASE_SERVICE_ROLE_KEY not set. You can still invoke using supabase CLI below."
  echo "Invoking via supabase CLI..."
  supabase functions invoke hf-dataset-importer --project-ref "$REF" --data '{"action":"import","datasetPath":"datavorous/entrance-exam-dataset","split":"train","sourceTag":"datavorous/entrance-exam-dataset","datasetProfile":"entrance-exam"}'
  exit 0
fi

SUPABASE_URL="$(node -e "console.log(require('./src/integrations/supabase/types').SUPABASE_URL || process.env.SUPABASE_URL || '')")" 2>/dev/null || SUPABASE_URL=""
if [ -z "$SUPABASE_URL" ]; then
  echo "Could not auto-detect SUPABASE_URL. Please set SUPABASE_URL env var or use supabase CLI invoke instead."
  echo "Falling back to CLI invoke..."
  supabase functions invoke hf-dataset-importer --project-ref "$REF" --data '{"action":"import","datasetPath":"datavorous/entrance-exam-dataset","split":"train","sourceTag":"datavorous/entrance-exam-dataset","datasetProfile":"entrance-exam"}'
  exit 0
fi

echo "Invoking via HTTP to ${SUPABASE_URL}..."

RESP=$(curl -sS -X POST "${SUPABASE_URL}/functions/v1/hf-dataset-importer" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"action":"import","datasetPath":"datavorous/entrance-exam-dataset","split":"train","sourceTag":"datavorous/entrance-exam-dataset","datasetProfile":"entrance-exam"}')

echo "Response:" && echo "$RESP"

echo "If successful, note the returned job_id and share it here so I can monitor progress."
