// Admin-only: move one or many questions to a different chapter/topic/subject.
// Validates that the caller is admin or super_admin via user_roles, then performs
// the update with the service role so RLS doesn't fight us. Returns row counts.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

interface MoveBody {
  questionIds: string[];
  chapterId?: string | null;
  topicId?: string | null;
  subjectId?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return json({ error: 'Missing Authorization header' }, 401);
    }
    const token = authHeader.slice('Bearer '.length);

    // Identify caller
    const authClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await authClient.auth.getUser(token);
    if (userErr || !userData?.user) {
      return json({ error: 'Invalid session' }, 401);
    }
    const userId = userData.user.id;

    // Service-role client for everything else
    const admin = createClient(url, serviceKey);

    // Verify caller is admin/super_admin
    const { data: roles, error: roleErr } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    if (roleErr) return json({ error: 'Role lookup failed' }, 500);
    const isAdmin = (roles || []).some((r: any) =>
      r.role === 'admin' || r.role === 'super_admin',
    );
    if (!isAdmin) return json({ error: 'Forbidden' }, 403);

    // Parse + validate body
    let body: MoveBody;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const ids = Array.isArray(body.questionIds)
      ? body.questionIds.filter((s) => typeof s === 'string' && s.length > 0)
      : [];
    if (ids.length === 0) {
      return json({ error: 'questionIds required' }, 400);
    }
    if (ids.length > 5000) {
      return json({ error: 'Max 5000 questions per call' }, 400);
    }

    const updates: Record<string, unknown> = {};
    if (body.chapterId !== undefined) updates.chapter_id = body.chapterId;
    if (body.topicId !== undefined) updates.topic_id = body.topicId;
    if (body.subjectId !== undefined) updates.subject_id = body.subjectId;

    if (Object.keys(updates).length === 0) {
      return json({ error: 'Provide at least one of chapterId / topicId / subjectId' }, 400);
    }

    // If chapterId provided, resolve subject + readable chapter name + class_level
    // so the questions row stays consistent (the legacy text columns are still used by some queries).
    if (typeof updates.chapter_id === 'string' && updates.chapter_id) {
      const { data: chapter } = await admin
        .from('chapters')
        .select('id, name, subject_id, subject, class_level')
        .eq('id', updates.chapter_id as string)
        .maybeSingle();
      if (!chapter) return json({ error: 'Chapter not found' }, 400);
      updates.subject_id = chapter.subject_id;
      if (chapter.subject) (updates as Record<string, unknown>).subject = chapter.subject;
      if (chapter.name) (updates as Record<string, unknown>).chapter = chapter.name;
    }

    updates.updated_at = new Date().toISOString();

    const { data: moved, error: updErr } = await admin
      .from('questions')
      .update(updates)
      .in('id', ids)
      .select('id');

    if (updErr) {
      return json({ error: updErr.message }, 500);
    }

    return json({
      ok: true,
      updated: moved?.length ?? 0,
      requested: ids.length,
      applied: updates,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
