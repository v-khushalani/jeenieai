import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  ArrowUp,
  CheckCircle2,
  Plus,
  Loader2,
  X,
  Flag,
  ArrowLeft,
  Users,
} from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCommunityFeed,
  useCommunityActions,
  useCommunityThread,
  type CommunityFilter,
} from '@/hooks/useCommunity';

const SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];
const FILTERS: { key: CommunityFilter; label: string }[] = [
  { key: 'latest', label: 'Latest' },
  { key: 'unsolved', label: 'Unsolved' },
  { key: 'mine', label: 'My posts' },
];

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const Avatar: React.FC<{ name?: string; url?: string | null }> = ({ name, url }) => (
  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold overflow-hidden shrink-0">
    {url ? (
      <img src={url} alt={name ?? 'Student'} className="w-full h-full object-cover" loading="lazy" />
    ) : (
      (name ?? 'S').slice(0, 1).toUpperCase()
    )}
  </div>
);

const Community: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [filter, setFilter] = useState<CommunityFilter>('latest');
  const [subject, setSubject] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [openPostId, setOpenPostId] = useState<string | null>(null);

  const { posts, loading, error, reload } = useCommunityFeed(filter, subject);
  const { createPost, createReply, toggleVote, acceptReply, report } = useCommunityActions();
  const { post, replies, reload: reloadThread } = useCommunityThread(openPostId);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [postSubject, setPostSubject] = useState<string | null>(null);
  const [postType, setPostType] = useState('doubt');
  const [submitting, setSubmitting] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [replying, setReplying] = useState(false);

  const emptyLabel = useMemo(() => {
    if (filter === 'mine') return 'You have not posted yet. Ask your first doubt.';
    if (filter === 'unsolved') return 'No unsolved doubts right now. Nice work!';
    return 'No discussions yet. Be the first to start one.';
  }, [filter]);

  const handleCreate = async () => {
    if (title.trim().length < 6) {
      toast({ title: 'Add a clearer title', description: 'At least 6 characters.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      await createPost({ title, body, subject: postSubject, post_type: postType });
      setTitle('');
      setBody('');
      setPostSubject(null);
      setComposerOpen(false);
      toast({ title: 'Posted', description: 'Your post is live for your grade.' });
      await reload();
    } catch (e: any) {
      toast({ title: 'Could not post', description: e?.message ?? 'Try again', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleReply = async () => {
    if (!openPostId || replyBody.trim().length < 2) return;
    setReplying(true);
    try {
      await createReply(openPostId, replyBody);
      setReplyBody('');
      await Promise.all([reloadThread(), reload()]);
    } catch (e: any) {
      toast({ title: 'Reply failed', description: e?.message ?? 'Try again', variant: 'destructive' });
    } finally {
      setReplying(false);
    }
  };

  const handleVote = async (postId: string | null, replyId: string | null) => {
    try {
      await toggleVote(postId, replyId);
      await Promise.all([reload(), openPostId ? reloadThread() : Promise.resolve()]);
    } catch (e: any) {
      toast({ title: 'Vote failed', description: e?.message ?? 'Try again', variant: 'destructive' });
    }
  };

  const handleAccept = async (replyId: string) => {
    try {
      await acceptReply(replyId);
      toast({ title: 'Marked as solution', description: 'Points awarded to the helper.' });
      await Promise.all([reloadThread(), reload()]);
    } catch (e: any) {
      toast({ title: 'Could not accept', description: e?.message ?? 'Try again', variant: 'destructive' });
    }
  };

  const handleReport = async (postId: string | null, replyId: string | null) => {
    try {
      await report(postId, replyId, 'inappropriate');
      toast({ title: 'Reported', description: 'Our team will review it.' });
    } catch (e: any) {
      toast({ title: 'Report failed', description: e?.message ?? 'Try again', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background pb-[calc(var(--app-mobile-nav-height,0px)+2rem)]">
      <Header />
      <main className="max-w-3xl mx-auto px-4 pt-6">
        <header className="mb-6">
          <div className="flex items-center gap-2 text-primary mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-wider">Community</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Ask. Answer. Level up.</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Discussions from students in your grade. Helpful answers earn JEEnie Points.
          </p>
        </header>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === f.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" />
          <button
            onClick={() => setSubject(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              subject === null ? 'bg-secondary text-foreground border-border' : 'bg-card text-muted-foreground border-border'
            }`}
          >
            All
          </button>
          {SUBJECTS.map((s) => (
            <button
              key={s}
              onClick={() => setSubject(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                subject === s ? 'bg-secondary text-foreground border-border' : 'bg-card text-muted-foreground border-border'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <Button onClick={() => setComposerOpen(true)} className="w-full mb-6 h-12 rounded-2xl font-semibold">
          <Plus className="w-4 h-4 mr-2" /> Start a discussion
        </Button>

        {loading && (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>
        )}

        {!loading && !error && posts.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <MessageSquare className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          </div>
        )}

        <div className="space-y-3">
          {posts.map((p, i) => (
            <motion.article
              key={p.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.3) }}
              className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start gap-3">
                <Avatar name={p.author?.full_name} url={p.author?.avatar_url} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <span className="font-semibold text-foreground">{p.author?.full_name ?? 'Student'}</span>
                    <span>·</span>
                    <span>{timeAgo(p.created_at)}</span>
                    {p.subject && <Badge variant="secondary" className="text-[10px]">{p.subject}</Badge>}
                    {p.is_solved && (
                      <Badge className="text-[10px] bg-emerald-500/15 text-emerald-600 border-none">Solved</Badge>
                    )}
                  </div>
                  <button
                    onClick={() => setOpenPostId(p.id)}
                    className="mt-1 text-left font-semibold leading-snug hover:text-primary transition-colors break-words"
                  >
                    {p.title}
                  </button>
                  {p.body && (
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2 break-words">{p.body}</p>
                  )}
                  <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                    <button
                      onClick={() => handleVote(p.id, null)}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      <ArrowUp className="w-4 h-4" /> {p.upvotes}
                    </button>
                    <button
                      onClick={() => setOpenPostId(p.id)}
                      className="flex items-center gap-1 hover:text-primary transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" /> {p.reply_count}
                    </button>
                    <button
                      onClick={() => handleReport(p.id, null)}
                      className="flex items-center gap-1 hover:text-destructive transition-colors ml-auto"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </main>

      {/* Composer */}
      <AnimatePresence>
        {composerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setComposerOpen(false)}
              className="fixed inset-0 bg-background/70 backdrop-blur-sm z-[60]"
            />
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.98 }}
              transition={{ type: 'spring', damping: 26, stiffness: 300 }}
              className="fixed z-[61] inset-x-0 bottom-0 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[520px] bg-card border border-border rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[92vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-lg">Start a discussion</h2>
                <Button variant="ghost" size="icon" onClick={() => setComposerOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <div className="flex gap-2">
                  {['doubt', 'discussion', 'resource'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setPostType(t)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border capitalize ${
                        postType === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — what do you need help with?" maxLength={160} />
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add details, what you tried, where you got stuck..." rows={5} maxLength={2500} />
                <div className="flex flex-wrap gap-2">
                  {SUBJECTS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setPostSubject(postSubject === s ? null : s)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                        postSubject === s ? 'bg-secondary text-foreground border-border' : 'border-border text-muted-foreground'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <Button onClick={handleCreate} disabled={submitting} className="w-full h-11 rounded-xl font-semibold">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Thread */}
      <AnimatePresence>
        {openPostId && post && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed inset-0 z-[62] bg-background overflow-y-auto"
          >
            <div className="max-w-2xl mx-auto px-4 py-5 pb-40">
              <button onClick={() => setOpenPostId(null)} className="flex items-center gap-2 text-sm text-muted-foreground mb-4 hover:text-foreground">
                <ArrowLeft className="w-4 h-4" /> Back to feed
              </button>

              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Avatar name={post.author?.full_name} url={post.author?.avatar_url} />
                  <div className="text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">{post.author?.full_name ?? 'Student'}</span> · {timeAgo(post.created_at)}
                  </div>
                </div>
                <h2 className="text-lg font-bold break-words">{post.title}</h2>
                {post.body && <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">{post.body}</p>}
                <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                  <button onClick={() => handleVote(post.id, null)} className="flex items-center gap-1 hover:text-primary">
                    <ArrowUp className="w-4 h-4" /> {post.upvotes}
                  </button>
                  <span className="flex items-center gap-1"><MessageSquare className="w-4 h-4" /> {post.reply_count}</span>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {replies.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No replies yet. Help them out.</p>
                )}
                {replies.map((r) => (
                  <div
                    key={r.id}
                    className={`rounded-2xl border p-4 ${
                      r.is_accepted ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border bg-card'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <Avatar name={r.author?.full_name} url={r.author?.avatar_url} />
                      <div className="text-xs text-muted-foreground">
                        <span className="font-semibold text-foreground">{r.author?.full_name ?? 'Student'}</span> · {timeAgo(r.created_at)}
                      </div>
                      {r.is_accepted && (
                        <Badge className="ml-auto text-[10px] bg-emerald-500/15 text-emerald-600 border-none">Solution</Badge>
                      )}
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{r.body}</p>
                    <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                      <button onClick={() => handleVote(null, r.id)} className="flex items-center gap-1 hover:text-primary">
                        <ArrowUp className="w-4 h-4" /> {r.upvotes}
                      </button>
                      {user?.id === post.user_id && !post.is_solved && (
                        <button onClick={() => handleAccept(r.id)} className="flex items-center gap-1 text-emerald-600 font-semibold">
                          <CheckCircle2 className="w-4 h-4" /> Mark as solution
                        </button>
                      )}
                      <button onClick={() => handleReport(null, r.id)} className="ml-auto hover:text-destructive">
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="fixed bottom-0 inset-x-0 border-t border-border bg-card/95 backdrop-blur-xl p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <div className="max-w-2xl mx-auto flex items-end gap-2">
                <Textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Write a helpful reply..."
                  rows={1}
                  className="min-h-[44px] max-h-32 resize-none"
                />
                <Button onClick={handleReply} disabled={replying} className="h-11 px-5 rounded-xl font-semibold shrink-0">
                  {replying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Reply'}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Community;
