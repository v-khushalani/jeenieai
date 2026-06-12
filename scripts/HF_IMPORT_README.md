# Hugging Face Import — deploy & demo script

This folder contains a small helper script to deploy the updated `hf-dataset-importer` Edge Function and run a 2k demo import of `datavorous/entrance-exam-dataset`.

Prerequisites
- `supabase` CLI installed and on PATH (https://supabase.com/docs/guides/cli)
- `jq` (for JSON parsing)
- A Supabase Personal Access Token (PAT) created in the Supabase dashboard

Steps

1. Create a Personal Access Token
   - In Supabase dashboard click your avatar → Account → Personal access tokens → Create new token
   - Copy the token (it is shown once)

2. Export the token in this Codespace / terminal

```bash
export SUPABASE_ACCESS_TOKEN="<paste-your-token-here>"
```

3. Run the deploy + demo script

```bash
chmod +x scripts/deploy_and_demo_import.sh
./scripts/deploy_and_demo_import.sh
```

What the script does
- Deploys `hf-dataset-importer`
- Invokes a 2k demo import and prints the raw function response
- Polls the import job until completion and prints imported/skipped/chapters_created/topics_created

After the script completes
- Open the Supabase SQL editor and run `scripts/verify_import.sql` (or copy the queries below) to verify that questions point to real chapters (no "Miscellaneous").

Create quick test users (optional)

You can create two test users (admin + student) with the Supabase CLI:

```bash
# create users (returns JSON with user id)
supabase auth admin create --email admin@example.com --password 'Password123!'
supabase auth admin create --email student@example.com --password 'Password123!'

# After you get the returned user IDs, insert profile rows via Supabase SQL editor:
-- replace <admin-uuid> and <student-uuid>
INSERT INTO profiles (id, full_name, email, created_at, updated_at)
VALUES ('<admin-uuid>', 'Admin Test', 'admin@example.com', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, full_name, email, created_at, updated_at)
VALUES ('<student-uuid>', 'Student Test', 'student@example.com', now(), now())
ON CONFLICT (id) DO NOTHING;

-- Optionally set admin role depending on your app's schema
UPDATE profiles SET role = 'admin' WHERE id = '<admin-uuid>';
```

If you want me to run the deploy+demo for you here, export the PAT and tell me "done" — I'll run the script and publish the results.
