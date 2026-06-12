#!/usr/bin/env bash
set -euo pipefail

# Deploy hf-dataset-importer and run a 2k demo import.
# Usage:
#   export SUPABASE_ACCESS_TOKEN="<your_PAT>"
#   ./scripts/deploy_and_demo_import.sh

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set. Create a Personal Access Token in Supabase and export it:" >&2
  echo "  export SUPABASE_ACCESS_TOKEN=\"<your_token>\"" >&2
  exit 1
fi

which supabase >/dev/null 2>&1 || { echo "supabase CLI not found on PATH. Install it: https://supabase.com/docs/guides/cli" >&2; exit 1; }
which jq >/dev/null 2>&1 || { echo "jq is required but not found. Install jq (apt install jq / brew install jq)" >&2; exit 1; }

DATASET_PATH="datavorous/entrance-exam-dataset"
SOURCE_TAG="datavorous/entrance-exam-dataset-demo"
LIMIT=2000

echo "-> Deploying hf-dataset-importer..."
supabase functions deploy hf-dataset-importer

echo "-> Invoking demo import (limit=${LIMIT})..."
INVOKE_OUT=$(supabase functions invoke hf-dataset-importer --data "{\"action\":\"import\",\"datasetPath\":\"${DATASET_PATH}\",\"split\":\"train\",\"sourceTag\":\"${SOURCE_TAG}\",\"limit\":${LIMIT}}" 2>&1)
echo "$INVOKE_OUT"

# Try to extract job_id from JSON output (the CLI prints the response body)
JOB_ID=$(echo "$INVOKE_OUT" | jq -r '.job_id // .job_id? // empty' || true)
if [ -z "$JOB_ID" ]; then
  # attempt to extract from any JSON printed
  JOB_ID=$(echo "$INVOKE_OUT" | jq -r '..|.job_id? // empty' || true)
fi

if [ -z "$JOB_ID" ]; then
  echo "Could not determine job_id from invoke response. Check output above and the import_jobs table in Supabase." >&2
  exit 1
fi

echo "-> Started import job: $JOB_ID"

echo "Polling job status until finished (ctrl-c to stop)..."
while true; do
  STATUS_OUT=$(supabase functions invoke hf-dataset-importer --data "{\"action\":\"status\",\"jobId\":\"${JOB_ID}\"}" 2>/dev/null || true)
  # extract job.status, imported, skipped, chapters_created, topics_created
  JOB_STATUS=$(echo "$STATUS_OUT" | jq -r '.job.status // empty' || true)
  IMPORTED=$(echo "$STATUS_OUT" | jq -r '.job.imported // empty' || true)
  SKIPPED=$(echo "$STATUS_OUT" | jq -r '.job.skipped // empty' || true)
  CHAPTERS_CREATED=$(echo "$STATUS_OUT" | jq -r '.job.chapters_created // empty' || true)
  TOPICS_CREATED=$(echo "$STATUS_OUT" | jq -r '.job.topics_created // empty' || true)

  printf "status=%s imported=%s skipped=%s chapters_created=%s topics_created=%s\r" "$JOB_STATUS" "$IMPORTED" "$SKIPPED" "$CHAPTERS_CREATED" "$TOPICS_CREATED"

  if [ "$JOB_STATUS" = "completed" ] || [ "$JOB_STATUS" = "failed" ] || [ "$JOB_STATUS" = "cancelled" ]; then
    echo "";
    echo "Job finished: status=$JOB_STATUS imported=$IMPORTED skipped=$SKIPPED chapters_created=$CHAPTERS_CREATED topics_created=$TOPICS_CREATED"
    break
  fi

  sleep 2
done

echo "Demo import finished. Run scripts/verify_import.sql in Supabase SQL editor to inspect results, or use the commands in scripts/HF_IMPORT_README.md"
