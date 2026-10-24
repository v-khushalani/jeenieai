import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

// Read-only checks run before migration. Submission/write checks require an
// explicit post-migration gate and existing QA accounts; never reset accounts.
const config = fs.readFileSync('src/integrations/supabase/client.ts', 'utf8');
const url = config.match(/const SUPABASE_URL = "([^"]+)"/)?.[1];
const key = config.match(/const SUPABASE_PUBLISHABLE_KEY = "([^"]+)"/)?.[1];
if (!url || !key) throw new Error('Supabase public configuration unavailable');
const questionId = 'f87211d7-0852-4f55-b597-153804bced96';
const keys = ['correct_option', 'correct_options', 'correct_answer', 'numerical_answer', 'numerical_tolerance', 'explanation', 'explanation_image_url'];
const headers = { apikey: key, Authorization: `Bearer ${key}` };

test('anonymous direct answer-column reads are forbidden at privilege level', async ({ request }) => {
  for (const column of keys) {
    const response = await request.get(`${url}/rest/v1/questions?select=${column}&limit=1`, { headers });
    // An empty 200 response proves only row filtering, not column protection.
    expect(response.status(), `${column} must have no anonymous column privilege`).toBe(401);
    const denied = await response.json();
    expect(denied.code).toBe('42501');
    // A failure inside an RLS helper can mask still-granted column privileges.
    expect(denied.message).toMatch(/permission denied for (table|column).*questions/);
  }
});

test('anonymous unseen-question RPC is forbidden', async ({ request }) => {
  const response = await request.post(`${url}/rest/v1/rpc/fetch_unseen_questions`, {
    headers, data: { p_user_id: '00000000-0000-0000-0000-000000000001', p_limit: 1 },
  });
  expect(response.status()).toBe(401);
});

test('anonymous historical answer-check RPC cannot retrieve a key', async ({ request }) => {
  const response = await request.post(`${url}/rest/v1/rpc/validate_question_answer`, {
    headers, data: { p_question_id: questionId, p_selected_option: 'A' },
  });
  // Deliberately do not print a returned answer key on failure.
  expect(response.status()).toBe(401);
});

test.describe('authenticated security checks after reviewed migration', () => {
  test.skip(!process.env.E2E_PASSWORD || process.env.SECURITY_MIGRATION_APPLIED !== '1',
    'Requires approved/applied migration and existing QA password from secure environment');

  async function student() {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await client.auth.signInWithPassword({ email: 'user@jeenie.website', password: process.env.E2E_PASSWORD ?? '' });
    expect(result.error).toBeNull();
    if (!result.data.user) throw new Error('QA session unavailable');
    return { client, user: result.data.user };
  }

  test('student cannot select protected columns directly', async () => {
    const { client } = await student();
    for (const column of keys) {
      const { error } = await client.from('questions').select(column).limit(1);
      expect(error?.code).toBe('42501');
    }
    await client.auth.signOut();
  });

  test('cross-user unseen fetch is rejected', async () => {
    const { client } = await student();
    const { error } = await client.rpc('fetch_unseen_questions', { p_user_id: '00000000-0000-0000-0000-000000000001', p_limit: 1 });
    expect(error?.code).toBe('42501');
    await client.auth.signOut();
  });

  test('own fetch is key-free and empty submission cannot open answers', async () => {
    const { client, user } = await student();
    const result = await client.rpc('fetch_unseen_questions', { p_user_id: user.id, p_limit: 1 });
    expect(result.error).toBeNull();
    expect(result.data?.length).toBe(1);
    for (const column of keys) expect(Object.hasOwn(result.data?.[0] ?? {}, column)).toBe(false);
    const empty = await client.rpc('validate_practice_answer', { p_question_id: questionId });
    expect(empty.error?.code).toBe('22023');
    await client.auth.signOut();
  });

  test('student denied cleanup and admin retains key access', async () => {
    const { client } = await student();
    // Invalid limit ensures this check cannot classify production questions.
    const cleanup = await client.rpc('backfill_text_quality', { p_limit: 0 });
    expect(cleanup.error?.code).toBe('42501');
    const adminRows = await client.from('questions_admin').select('id,correct_option').limit(1);
    expect(adminRows.error?.code).toBe('42501');
    await client.auth.signOut();
    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const login = await admin.auth.signInWithPassword({ email: 'admin@jeenie.website', password: process.env.E2E_PASSWORD ?? '' });
    expect(login.error).toBeNull();
    const rows = await admin.from('questions_admin').select('id,correct_option').limit(1);
    expect(rows.error).toBeNull();
    expect(rows.data?.length).toBe(1);
    await admin.auth.signOut();
  });
});