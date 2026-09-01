import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Save, Sparkle, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { QuestionLivePreview } from '@/components/admin/QuestionLivePreview';

const REPAIR_TOKEN = 'qa-repair-latex-2026-jeenie';

interface DamagedQuestion {
  id: string;
  question: string | null;
  question_text: string | null;
  question_image_url: string | null;
  option_a: string | null;
  option_b: string | null;
  option_c: string | null;
  option_d: string | null;
  option_a_image_url: string | null;
  option_b_image_url: string | null;
  option_c_image_url: string | null;
  option_d_image_url: string | null;
  correct_option: string | null;
  explanation: string | null;
  explanation_image_url: string | null;
  subject: string | null;
  chapter: string | null;
  text_quality: string | null;
  is_active: boolean | null;
}

type QualityFilter = 'damaged' | 'needs_review';

const QuestionHealthManager: React.FC = () => {
  const { toast } = useToast();
  const [quality, setQuality] = useState<QualityFilter>('damaged');
  const [subject, setSubject] = useState<string>('all');
  const [rows, setRows] = useState<DamagedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<{ damaged: number; needs_review: number }>({ damaged: 0, needs_review: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DamagedQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);

  const loadCounts = useCallback(async () => {
    const [d, n] = await Promise.all([
      supabase.from('questions').select('id', { count: 'exact', head: true }).eq('text_quality', 'damaged'),
      supabase.from('questions').select('id', { count: 'exact', head: true }).eq('text_quality', 'needs_review'),
    ]);
    setCounts({ damaged: d.count ?? 0, needs_review: n.count ?? 0 });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('questions')
      .select(
        'id, question, question_text, question_image_url, option_a, option_b, option_c, option_d, option_a_image_url, option_b_image_url, option_c_image_url, option_d_image_url, correct_option, explanation, explanation_image_url, subject, chapter, text_quality, is_active',
      )
      .eq('text_quality', quality)
      .order('subject', { ascending: true })
      .limit(100);
    if (subject !== 'all') q = q.eq('subject', subject);

    const { data, error } = await q;
    setLoading(false);
    if (error) {
      toast({ title: 'Load failed', description: error.message, variant: 'destructive' });
      return;
    }
    const list = (data ?? []) as DamagedQuestion[];
    setRows(list);
    setSelectedId((prev) => (prev && list.some((r) => r.id === prev) ? prev : list[0]?.id ?? null));
  }, [quality, subject, toast]);

  useEffect(() => {
    void load();
    void loadCounts();
  }, [load, loadCounts]);

  useEffect(() => {
    const found = rows.find((r) => r.id === selectedId) ?? null;
    setDraft(found ? { ...found } : null);
  }, [selectedId, rows]);

  const previewQuestion = useMemo(
    () => ({
      question: draft?.question_text || draft?.question || '',
      question_image_url: draft?.question_image_url,
      option_a: draft?.option_a,
      option_a_image_url: draft?.option_a_image_url,
      option_b: draft?.option_b,
      option_b_image_url: draft?.option_b_image_url,
      option_c: draft?.option_c,
      option_c_image_url: draft?.option_c_image_url,
      option_d: draft?.option_d,
      option_d_image_url: draft?.option_d_image_url,
      correct_option: draft?.correct_option,
      explanation: draft?.explanation,
      explanation_image_url: draft?.explanation_image_url,
    }),
    [draft],
  );

  const patch = (key: keyof DamagedQuestion, value: string) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const saveDraft = async (markFixed: boolean) => {
    if (!draft) return;
    setSaving(true);
    const update: Record<string, unknown> = {
      question: draft.question_text || draft.question,
      question_text: draft.question_text || draft.question,
      option_a: draft.option_a,
      option_b: draft.option_b,
      option_c: draft.option_c,
      option_d: draft.option_d,
      correct_option: draft.correct_option,
      explanation: draft.explanation,
    };
    if (markFixed) {
      update.text_quality = 'valid';
      update.is_active = true;
    }
    const { error } = await supabase.from('questions').update(update).eq('id', draft.id);
    setSaving(false);
    if (error) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: markFixed ? 'Marked fixed and re-activated' : 'Saved' });
    await Promise.all([load(), loadCounts()]);
  };

  const discardQuestion = async () => {
    if (!draft) return;
    const { error } = await supabase
      .from('questions')
      .update({ is_active: false, text_quality: 'discarded' })
      .eq('id', draft.id);
    if (error) {
      toast({ title: 'Could not discard', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Question retired' });
    await Promise.all([load(), loadCounts()]);
  };

  const runAiBatch = async () => {
    setAiBusy(true);
    try {
      const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/repair-question-latex`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-setup-token': REPAIR_TOKEN,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
        },
        body: JSON.stringify({ limit: 40 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? 'AI repair failed');
      toast({ title: 'AI repair run complete', description: `${json.repaired ?? 0} questions rewritten.` });
      await Promise.all([load(), loadCounts()]);
    } catch (e: any) {
      toast({ title: 'AI repair failed', description: e?.message ?? 'Try again', variant: 'destructive' });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={quality === 'damaged' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setQuality('damaged')}
        >
          <AlertTriangle className="w-4 h-4 mr-2" /> Damaged ({counts.damaged})
        </Button>
        <Button
          variant={quality === 'needs_review' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setQuality('needs_review')}
        >
          Needs review ({counts.needs_review})
        </Button>
        <select
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="all">All subjects</option>
          <option value="Physics">Physics</option>
          <option value="Chemistry">Chemistry</option>
          <option value="Mathematics">Mathematics</option>
          <option value="Biology">Biology</option>
        </select>
        <Button variant="outline" size="sm" onClick={() => { void load(); void loadCounts(); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
        <Button size="sm" onClick={runAiBatch} disabled={aiBusy} className="ml-auto">
          {aiBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkle className="w-4 h-4 mr-2" />}
          AI repair next 40
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr] gap-4">
        {/* List */}
        <Card className="p-2 h-[70vh] overflow-y-auto">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-10">Nothing pending here. 🎉</p>
          )}
          {rows.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left p-2.5 rounded-lg mb-1 border transition-colors ${
                selectedId === r.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="secondary" className="text-[10px]">{r.subject ?? '—'}</Badge>
                {!r.is_active && <Badge variant="outline" className="text-[10px]">inactive</Badge>}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-2 break-words">
                {(r.question_text || r.question || '').slice(0, 120)}
              </p>
            </button>
          ))}
        </Card>

        {/* Editor */}
        <Card className="p-4 h-[70vh] overflow-y-auto space-y-3">
          {!draft && <p className="text-sm text-muted-foreground">Select a question to repair.</p>}
          {draft && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Question</label>
                <Textarea
                  rows={6}
                  value={draft.question_text || draft.question || ''}
                  onChange={(e) => patch('question_text', e.target.value)}
                />
              </div>
              {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map((k) => (
                <div key={k}>
                  <label className="text-xs font-semibold text-muted-foreground uppercase">{k.replace('option_', 'Option ')}</label>
                  <Input value={draft[k] ?? ''} onChange={(e) => patch(k, e.target.value)} />
                </div>
              ))}
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Correct option</label>
                <Input value={draft.correct_option ?? ''} onChange={(e) => patch('correct_option', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Explanation</label>
                <Textarea rows={4} value={draft.explanation ?? ''} onChange={(e) => patch('explanation', e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => saveDraft(false)} disabled={saving}>
                  <Save className="w-4 h-4 mr-2" /> Save draft
                </Button>
                <Button size="sm" onClick={() => saveDraft(true)} disabled={saving}>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Mark fixed & activate
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={discardQuestion}>
                  <Trash2 className="w-4 h-4 mr-2" /> Retire
                </Button>
              </div>
            </>
          )}
        </Card>

        {/* Live preview */}
        <Card className="p-4 h-[70vh] overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Student view (live)</p>
          {draft ? <QuestionLivePreview question={previewQuestion} /> : <p className="text-sm text-muted-foreground">—</p>}
        </Card>
      </div>
    </div>
  );
};

export default QuestionHealthManager;
