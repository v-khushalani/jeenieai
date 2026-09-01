import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface CommunityAuthor {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

export interface CommunityPost {
  id: string;
  user_id: string;
  grade: number | null;
  goal_exam: string | null;
  subject: string | null;
  post_type: string;
  title: string;
  body: string | null;
  image_url: string | null;
  is_solved: boolean;
  accepted_reply_id: string | null;
  upvotes: number;
  reply_count: number;
  created_at: string;
  author?: CommunityAuthor;
}

export interface CommunityReply {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  image_url: string | null;
  upvotes: number;
  is_accepted: boolean;
  created_at: string;
  author?: CommunityAuthor;
}

export type CommunityFilter = 'latest' | 'unsolved' | 'mine';

async function attachAuthors<T extends { user_id: string }>(rows: T[]): Promise<(T & { author?: CommunityAuthor })[]> {
  const ids = Array.from(new Set(rows.map((r) => r.user_id)));
  if (ids.length === 0) return rows;
  const { data } = await supabase.rpc('community_get_authors', { p_user_ids: ids });
  const map = new Map<string, CommunityAuthor>();
  (data as CommunityAuthor[] | null)?.forEach((a) => map.set(a.id, a));
  return rows.map((r) => ({ ...r, author: map.get(r.user_id) }));
}

export function useCommunityFeed(filter: CommunityFilter, subject: string | null) {
  const { user, profile } = useAuth() as any;
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('community_posts')
        .select('*')
        .eq('is_hidden', false)
        .order('created_at', { ascending: false })
        .limit(50);

      const grade = profile?.grade ?? null;
      if (grade) query = query.eq('grade', grade);
      if (subject) query = query.eq('subject', subject);
      if (filter === 'unsolved') query = query.eq('is_solved', false);
      if (filter === 'mine') query = query.eq('user_id', user.id);

      const { data, error: err } = await query;
      if (err) throw err;
      setPosts(await attachAuthors((data ?? []) as CommunityPost[]));
    } catch (e: any) {
      setError(e?.message ?? 'Could not load community');
    } finally {
      setLoading(false);
    }
  }, [user, profile?.grade, filter, subject]);

  useEffect(() => {
    void load();
  }, [load]);

  return { posts, loading, error, reload: load };
}

export function useCommunityActions() {
  const { user, profile } = useAuth() as any;

  const createPost = useCallback(
    async (input: { title: string; body: string; subject: string | null; post_type: string }) => {
      if (!user) throw new Error('Login required');
      const { data, error } = await supabase
        .from('community_posts')
        .insert({
          user_id: user.id,
          title: input.title.trim(),
          body: input.body.trim() || null,
          subject: input.subject,
          post_type: input.post_type,
          grade: profile?.grade ?? null,
          goal_exam: profile?.goal_exam ?? profile?.target_exam ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as CommunityPost;
    },
    [user, profile?.grade, profile?.goal_exam, profile?.target_exam],
  );

  const createReply = useCallback(
    async (postId: string, body: string, parentReplyId?: string | null) => {
      if (!user) throw new Error('Login required');
      const { data, error } = await supabase
        .from('community_replies')
        .insert({
          post_id: postId,
          user_id: user.id,
          body: body.trim(),
          parent_reply_id: parentReplyId ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as CommunityReply;
    },
    [user],
  );

  const toggleVote = useCallback(async (postId: string | null, replyId: string | null) => {
    const { data, error } = await supabase.rpc('community_toggle_vote', {
      p_post_id: postId,
      p_reply_id: replyId,
    });
    if (error) throw error;
    return data;
  }, []);

  const acceptReply = useCallback(async (replyId: string) => {
    const { data, error } = await supabase.rpc('community_accept_reply', { p_reply_id: replyId });
    if (error) throw error;
    return data;
  }, []);

  const report = useCallback(
    async (postId: string | null, replyId: string | null, reason: string) => {
      if (!user) throw new Error('Login required');
      const { error } = await supabase.from('community_reports').insert({
        user_id: user.id,
        post_id: postId,
        reply_id: replyId,
        reason,
      });
      if (error) throw error;
    },
    [user],
  );

  return { createPost, createReply, toggleVote, acceptReply, report };
}

export function useCommunityThread(postId: string | null) {
  const [post, setPost] = useState<CommunityPost | null>(null);
  const [replies, setReplies] = useState<CommunityReply[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from('community_posts').select('*').eq('id', postId).maybeSingle(),
        supabase
          .from('community_replies')
          .select('*')
          .eq('post_id', postId)
          .eq('is_hidden', false)
          .order('is_accepted', { ascending: false })
          .order('created_at', { ascending: true }),
      ]);
      if (p) setPost((await attachAuthors([p as CommunityPost]))[0]);
      setReplies(await attachAuthors((r ?? []) as CommunityReply[]));
    } finally {
      setLoading(false);
    }
  }, [postId]);

  useEffect(() => {
    if (!postId) {
      setPost(null);
      setReplies([]);
      return;
    }
    void load();
  }, [postId, load]);

  return { post, replies, loading, reload: load };
}
