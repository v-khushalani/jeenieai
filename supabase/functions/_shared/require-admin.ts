import { createClient } from 'npm:@supabase/supabase-js@2';

export async function requireAdmin(req: Request) {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = req.headers.get('Authorization');
  if (!url || !key || !serviceKey || !authorization?.startsWith('Bearer ')) return null;
  const caller = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data, error } = await caller.auth.getUser();
  if (error || !data.user) return null;
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const roles = await admin.from('user_roles').select('role').eq('user_id', data.user.id).in('role', ['admin', 'super_admin']);
  if (roles.error || !roles.data?.length) return null;
  return admin;
}