Re-deploy & Re-import (HF dataset)
=================================

This helper explains how to redeploy the updated `hf-dataset-importer` edge function, optionally remove a previous HF import, and re-run the import so questions map to chapters correctly.

Important: I cannot accept or handle your Supabase keys. Run the script locally and provide the required env vars yourself.

Prerequisites
-------------
- `supabase` CLI installed and logged in
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exported in your shell

Quick steps
-----------
1. Export your vars and (optionally) set `SOURCE_TAG` to the source tag used during the previous import (e.g. `hf:datavorous/entrance-exam-dataset`):

```bash
export SUPABASE_URL="https://abc123.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key_here"
export SOURCE_TAG="hf:datavorous/entrance-exam-dataset"   # optional: delete old imported rows
```

2. Run the helper script (interactive confirmation required):

```bash
bash scripts/redeploy_and_reimport.sh
```

What the script does
--------------------
- Deploys the `hf-dataset-importer` function using `supabase functions deploy`.
- If you provide `SOURCE_TAG` and confirm by typing `DELETE`, it sends a DELETE request to the PostgREST endpoint to remove questions with that `source` value.
- Invokes `hf-dataset-importer` with `action: import` and the dataset path.

Safety notes
------------
- The deletion step is irreversible unless you have a DB backup. Do not proceed if you need to keep the old rows.
- If you are unsure, omit `SOURCE_TAG` and the script will skip deletion — the new import will add new questions (you may need to deduplicate or revert the older ones manually).

If you want me to generate a non-destructive backfill script instead (that re-maps existing rows without deletion), say so and I will add it; it will need more careful logic and a test run.

High-speed bulk import
---------------------
If the edge function path is too slow or hits worker limits, use the local bulk importer instead. It fetches the HF dataset, dedupes it against existing question hashes, upserts chapters/topics, and inserts questions directly through the linked database.

Run it with:

```bash
export SUPABASE_ACCESS_TOKEN="..."
export DATASET_PATH="datavorous/entrance-exam-dataset"
export LIMIT="2000"
npm run bulk:import-hf
```

Useful overrides:

```bash
export SOURCE_TAG="datavorous/entrance-exam-dataset-bulk"
export PAGE_SIZE="100"
export APPLY="true"
```

Set `APPLY=false` to do a dry run without writing anything.
