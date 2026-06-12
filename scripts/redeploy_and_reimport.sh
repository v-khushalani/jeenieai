#!/usr/bin/env bash
set -euo pipefail

# Redeploy hf-dataset-importer, optionally delete previous import by source tag,
# and re-run import. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars
# and the supabase CLI installed and authenticated.

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "ERROR: Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your environment." >&2
  echo "You can export them like: export SUPABASE_URL=...; export SUPABASE_SERVICE_ROLE_KEY=..." >&2
  exit 1
fi

SOURCE_TAG=${SOURCE_TAG:-}
DATASET_PATH=${DATASET_PATH:-datavorous/entrance-exam-dataset}
SPLIT=${SPLIT:-train}

echo "About to deploy hf-dataset-importer and (optionally) re-import dataset: $DATASET_PATH (split=$SPLIT)"

read -rp "Continue? [y/N] " yn
if [[ ! "$yn" =~ ^[Yy]$ ]]; then
  echo "Aborting."; exit 0
fi

echo "Deploying function hf-dataset-importer..."
supabase functions deploy hf-dataset-importer

if [ -n "$SOURCE_TAG" ]; then
  echo "You provided SOURCE_TAG='$SOURCE_TAG'. This script will DELETE all questions with source = '$SOURCE_TAG'."
  echo "This operation is irreversible unless you have a DB backup."
  read -rp "Type DELETE to confirm: " confirm
  if [ "$confirm" = "DELETE" ]; then
    echo "Deleting questions with source='$SOURCE_TAG'..."
    # Use PostgREST to delete rows by source. Requires service role key.
    curl -sS -X DELETE "$SUPABASE_URL/rest/v1/questions?source=eq.$SOURCE_TAG" \
      -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
      -H "Accept: application/json"
    echo "Delete request sent. Check Supabase dashboard or run SQL to confirm.";
  else
    echo "Delete not confirmed. Skipping deletion.";
  fi
else
  echo "No SOURCE_TAG provided — skipping delete step. If you want to remove previous import, set SOURCE_TAG env var to the exact source tag used (e.g. hf:datavorous/entrance-exam-dataset) and re-run this script.";
fi

echo "Invoking hf-dataset-importer to start import..."
supabase functions invoke hf-dataset-importer --data "{\"action\":\"import\",\"datasetPath\":\"$DATASET_PATH\",\"split\":\"$SPLIT\",\"sourceTag\":\"hf:$DATASET_PATH\",\"datasetProfile\":\"entrance-exam\"}"

echo "Done. Monitor import via the Admin UI -> HuggingFace Importer or check import_jobs table." 
