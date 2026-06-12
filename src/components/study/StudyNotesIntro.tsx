import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Sparkles, ArrowRight, Clock, Crown, X, Lock } from 'lucide-react';
import { safeLocalStorage } from '@/utils/safeStorage';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { DocumentViewer, type NoteForViewer } from './DocumentViewer';

interface Props {
  chapterId?: string | null;
  topicId?: string | null;
}

const skipKey = (id: string) => `jeenie:notes-skipped:${id}`;

/**
 * Pro+ only document-style theory viewer.
 * Auto-opens when a chapter has a published note. Non-Pro+ see an upsell card.
 */
export function StudyNotesIntro({ chapterId, topicId }: Props) {
  const { subscriptionTier } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState<NoteForViewer | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [dontShow, setDontShow] = useState(false);

  const isProPlus = subscriptionTier === 'pro_plus';

  useEffect(() => {
    if (!chapterId) return;
    if (safeLocalStorage.getItem(skipKey(chapterId)) === '1') return;
    let cancelled = false;
    (async () => {
      // Always fetch preview metadata (visible to everyone via the view)
      const previewQ = (supabase as any)
        .from('study_notes_preview')
        .select('id, title, subtitle, reading_time_minutes, document_type, requires_pro_plus, chapter_id, topic_id')
        .eq('chapter_id', chapterId)
        .limit(1);
      if (topicId) previewQ.eq('topic_id', topicId);
      const { data: prev } = await previewQ;
      if (cancelled || !prev || !prev[0]) return;
      setPreview(prev[0]);

      // If user has access, fetch full note
      if (isProPlus || !prev[0].requires_pro_plus) {
        const { data } = await (supabase as any)
          .from('study_notes')
          .select('id, title, subtitle, content_md, document_url, document_type, document_name, document_pages, reading_time_minutes')
          .eq('id', prev[0].id)
          .maybeSingle();
        if (cancelled || !data) return;
        setNote(data as NoteForViewer);
      }
      setOpen(true);
    })();
    return () => { cancelled = true; };
  }, [chapterId, topicId, isProPlus]);

  const dismiss = () => {
    if (dontShow && chapterId) safeLocalStorage.setItem(skipKey(chapterId), '1');
    setOpen(false);
  };

  if (!preview) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && dismiss()}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden gap-0 h-[92vh] flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary via-primary/95 to-primary/80 text-primary-foreground px-5 py-4 flex items-center gap-3 shrink-0 border-b border-primary-foreground/10">
          <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-base">Theory by JEEnie</span>
              {preview.requires_pro_plus && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] gap-1">
                  <Crown className="w-2.5 h-2.5" /> Pro+
                </Badge>
              )}
              {preview.reading_time_minutes && (
                <Badge variant="secondary" className="h-4 px-1.5 text-[10px] gap-1">
                  <Clock className="w-2.5 h-2.5" /> {preview.reading_time_minutes} min read
                </Badge>
              )}
            </div>
            <div className="text-[11px] opacity-90 mt-0.5 truncate">{preview.title}</div>
          </div>
          <button onClick={dismiss} className="w-8 h-8 rounded-full hover:bg-primary-foreground/20 flex items-center justify-center transition" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body — gated by Pro+ */}
        {note ? (
          <DocumentViewer note={note} />
        ) : (
          <div className="flex-1 flex items-center justify-center p-6 bg-muted/30">
            <div className="max-w-sm text-center space-y-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                <Lock className="w-8 h-8 text-primary-foreground" />
              </div>
              <h3 className="text-xl font-bold">Theory locked</h3>
              <p className="text-sm text-muted-foreground">
                Upgrade to <strong>JEEnie Pro+</strong> to read the curated theory for <strong>{preview.title}</strong> before you solve.
              </p>
              <Button onClick={() => navigate('/subscription-plans')} className="gap-2">
                <Crown className="w-4 h-4" /> Unlock with Pro+
              </Button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t bg-background flex items-center justify-between gap-3 shrink-0">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(!!v)} />
            Don't show again for this chapter
          </label>
          <Button size="sm" onClick={dismiss}>
            {note ? 'Start practice' : 'Continue'} <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudyNotesIntro;
