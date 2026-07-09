/**
 * LogClassSheet — 3-tap class logger for Companion / Hybrid mode.
 * Subject → Chapter search → Save. On success returns the class_log row.
 */
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, BookOpen, ChevronLeft, Search, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Chapter { id: string; name: string; subject: string; class_level: number | null; }

interface LogClassSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogged: (classLogId: string) => void;
  defaultSubjects?: string[];
}

const DEFAULT_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics', 'Biology'];

export default function LogClassSheet({ open, onOpenChange, onLogged, defaultSubjects }: LogClassSheetProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'subject' | 'chapter'>('subject');
  const [subject, setSubject] = useState<string | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');

  const subjects = useMemo(() => (defaultSubjects?.length ? defaultSubjects : DEFAULT_SUBJECTS), [defaultSubjects]);

  useEffect(() => {
    if (!open) {
      setStep('subject'); setSubject(null); setChapters([]); setQuery('');
    }
  }, [open]);

  const pickSubject = async (s: string) => {
    setSubject(s);
    setStep('chapter');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('chapters')
        .select('id, name, chapter_name, subject, class_level')
        .ilike('subject', s)
        .eq('is_active', true)
        .order('chapter_number', { ascending: true, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      setChapters((data ?? []).map((c: any) => ({
        id: c.id,
        name: c.name ?? c.chapter_name ?? 'Untitled',
        subject: c.subject,
        class_level: c.class_level,
      })));
    } catch (e: any) {
      toast.error(e?.message ?? 'Chapters load nahi ho paye');
    } finally {
      setLoading(false);
    }
  };

  const saveLog = async (chapter: Chapter | null, freeText?: string) => {
    if (!user?.id || !subject) return;
    setSaving(true);
    try {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
      const { data, error } = await supabase
        .from('class_logs')
        .insert({
          user_id: user.id,
          logged_date: today,
          subject,
          chapter_id: chapter?.id ?? null,
          chapter_name: chapter?.name ?? freeText ?? null,
          source: 'manual',
        })
        .select('id')
        .single();
      if (error) throw error;
      toast.success('Class logged — mission update ho rahi hai');
      onLogged(data.id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? 'Save nahi ho paya');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!query.trim()) return chapters;
    const q = query.toLowerCase();
    return chapters.filter(c => c.name.toLowerCase().includes(q));
  }, [chapters, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 'chapter' && (
              <button onClick={() => { setStep('subject'); setSubject(null); setQuery(''); }} className="p-1 -ml-1 rounded hover:bg-muted">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            {step === 'subject' ? 'Aaj kya padha class mein?' : `${subject} — chapter chuno`}
          </DialogTitle>
          <DialogDescription>
            {step === 'subject'
              ? 'JEEnie is chapter ka practice + recap test aaj ki mission mein daal degi.'
              : 'Chapter select karo — ya neeche apna likh do.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'subject' && (
          <div className="grid grid-cols-2 gap-2 py-2">
            {subjects.map((s) => (
              <button
                key={s}
                onClick={() => pickSubject(s)}
                className="p-4 rounded-xl border border-border hover:border-primary hover:bg-primary/5 transition text-left"
              >
                <BookOpen className="w-5 h-5 mb-2 text-primary" />
                <p className="text-sm font-semibold">{s}</p>
              </button>
            ))}
          </div>
        )}

        {step === 'chapter' && (
          <div className="space-y-2 py-1">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search chapter (e.g. Rotation, Aldehydes)…"
                className="pl-9 h-10"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
              {loading ? (
                <div className="py-8 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-6 text-center space-y-3">
                  <p className="text-xs text-muted-foreground">Koi match nahi mila</p>
                  {query.trim() && (
                    <Button size="sm" variant="outline" onClick={() => saveLog(null, query.trim())} disabled={saving}>
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Log as "{query.trim()}"
                    </Button>
                  )}
                </div>
              ) : (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => saveLog(c)}
                    disabled={saving}
                    className="w-full text-left p-2.5 rounded-lg border border-border/60 hover:border-primary/50 hover:bg-primary/5 transition flex items-center justify-between gap-2"
                  >
                    <span className="text-sm font-medium truncate">{c.name}</span>
                    {c.class_level && <Badge variant="outline" className="text-[10px] shrink-0">Cl {c.class_level}</Badge>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {saving && (
          <DialogFooter>
            <div className="w-full flex items-center justify-center text-xs text-muted-foreground gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
