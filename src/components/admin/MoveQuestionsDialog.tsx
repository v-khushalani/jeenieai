import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Loader2, FolderInput } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Chapter {
  id: string;
  name: string;
  subject: string | null;
  class_level: number | null;
}
interface Topic { id: string; name: string; chapter_id: string }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionIds: string[];
  onMoved?: () => void;
}

/**
 * Admin tool: move one or many questions to a different chapter (and optionally topic).
 * Calls the `admin-move-questions` edge function which enforces admin role server-side.
 */
export default function MoveQuestionsDialog({ open, onOpenChange, questionIds, onMoved }: Props) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [chapterId, setChapterId] = useState<string>('');
  const [topicId, setTopicId] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingChapters(true);
      const { data, error } = await supabase
        .from('chapters')
        .select('id, name, subject, class_level')
        .eq('is_active', true)
        .order('subject')
        .order('class_level')
        .order('name')
        .limit(2000);
      if (cancelled) return;
      setLoadingChapters(false);
      if (error) { toast.error('Failed to load chapters'); return; }
      setChapters((data || []) as Chapter[]);
    })();
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!chapterId) { setTopics([]); setTopicId(''); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('topics')
        .select('id, name, chapter_id')
        .eq('chapter_id', chapterId)
        .eq('is_active', true)
        .order('name')
        .limit(500);
      if (cancelled) return;
      setTopics((data || []) as Topic[]);
    })();
    return () => { cancelled = true; };
  }, [chapterId]);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    chapters.forEach(c => { if (c.subject) set.add(c.subject); });
    return Array.from(set).sort();
  }, [chapters]);

  const visibleChapters = useMemo(() => {
    return chapters.filter(c => subjectFilter === 'all' || c.subject === subjectFilter);
  }, [chapters, subjectFilter]);

  const handleMove = async () => {
    if (!chapterId) { toast.error('Pick a destination chapter'); return; }
    setSubmitting(true);
    const tId = toast.loading(`Moving ${questionIds.length} question(s)…`);
    try {
      const { data, error } = await supabase.functions.invoke('admin-move-questions', {
        body: {
          questionIds,
          chapterId,
          topicId: topicId || null,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      toast.success(`Moved ${data?.updated ?? questionIds.length} question(s)`, { id: tId });
      onMoved?.();
      onOpenChange(false);
      setChapterId(''); setTopicId('');
    } catch (e: any) {
      toast.error(`Move failed: ${e.message}`, { id: tId });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderInput className="w-4 h-4" />
            Move {questionIds.length === 1 ? 'question' : `${questionIds.length} questions`}
          </DialogTitle>
          <DialogDescription>
            Pick the destination chapter (and topic, if needed). The question's subject and class are auto-updated to match.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Filter by subject</Label>
            <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {subjects.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Destination chapter *</Label>
            <Select value={chapterId} onValueChange={setChapterId} disabled={loadingChapters}>
              <SelectTrigger>
                <SelectValue placeholder={loadingChapters ? 'Loading…' : 'Pick a chapter'} />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {visibleChapters.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="text-xs">
                      <Badge variant="outline" className="mr-1 text-[10px]">{c.subject || '—'}</Badge>
                      {c.class_level ? `Cl ${c.class_level} · ` : ''}{c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chapterId && (
            <div className="space-y-1.5">
              <Label className="text-xs">Topic (optional)</Label>
              <Select value={topicId} onValueChange={setTopicId}>
                <SelectTrigger>
                  <SelectValue placeholder={topics.length === 0 ? 'No topics in this chapter' : 'No topic / keep current'} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {topics.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleMove} disabled={!chapterId || submitting}>
            {submitting && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
            Move
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
