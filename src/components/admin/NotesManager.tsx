import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FilterPills } from '@/components/ui/FilterPills';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, BookOpen, Network, Eye, Upload, FileText, X, AlertCircle, Crown } from 'lucide-react';
import { PROGRAM_SUBJECTS } from '@/utils/programConfig';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DocumentViewer } from '@/components/study/DocumentViewer';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';

type Chapter = { id: string; chapter_name: string | null; name: string | null; subject: string | null; class_level: number | null; exam_relevance: string[] | null; };
type Topic = { id: string; topic_name: string | null; name: string | null; chapter_id: string | null; };
type Note = {
  id: string; chapter_id: string | null; topic_id: string | null;
  title: string; subtitle?: string | null; subject: string | null;
  class_level: number | null; exam_relevance: string[] | null;
  content_md: string; reading_time_minutes: number | null; is_published: boolean | null;
  document_url?: string | null; document_type?: string | null;
  document_name?: string | null; document_pages?: number | null;
  requires_pro_plus?: boolean | null;
};
type ConceptMap = { id: string; chapter_id: string | null; topic_id: string | null; title: string; subject: string | null; nodes: any; edges: any; is_published: boolean | null; };

const EXAMS = ['JEE', 'NEET', 'MH_CET', 'Class'];
const GRADES = ['11', '12'];

const calcReadingTime = (md: string) => Math.max(1, Math.ceil(md.trim().split(/\s+/).length / 200));

const NOTE_TEMPLATE = `# Chapter Quick Theory

## 🎯 Key Concepts
- **Concept 1**: brief explanation

## 📐 Important Formulas
- Formula 1: $F = ma$

## ⚡ Quick Tips
1. Tip one

## 🧠 Remember
> Mnemonic / golden rule goes here.
`;

const MAP_TEMPLATE = {
  nodes: [
    { id: 'root', label: 'Main Concept', x: 250, y: 30, color: 'primary' },
    { id: 'a', label: 'Sub-concept A', x: 100, y: 160, color: 'accent' },
    { id: 'b', label: 'Sub-concept B', x: 400, y: 160, color: 'accent' },
  ],
  edges: [
    { from: 'root', to: 'a', label: 'leads to' },
    { from: 'root', to: 'b', label: 'leads to' },
  ],
};

// Dedupe chapters by normalized title (case/space-insensitive)
const dedupeChapters = (rows: Chapter[]): Chapter[] => {
  const seen = new Map<string, Chapter>();
  for (const c of rows) {
    const title = c.chapter_name || c.name || '';
    const key = title.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!key) continue;
    if (!seen.has(key)) seen.set(key, c);
  }
  return Array.from(seen.values());
};

export default function NotesManager() {
  const studyNotesEnabled = useFeatureFlag('study_notes');
  const [exam, setExam] = useState<string>('JEE');
  const [grade, setGrade] = useState<string>('11');
  const [subject, setSubject] = useState<string>('Physics');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [maps, setMaps] = useState<ConceptMap[]>([]);
  const [loading, setLoading] = useState(false);

  const subjects = PROGRAM_SUBJECTS[exam as keyof typeof PROGRAM_SUBJECTS] || ['Physics'];

  useEffect(() => {
    if (!subjects.includes(subject)) setSubject(subjects[0]);
  }, [exam]); // eslint-disable-line

  useEffect(() => { loadAll(); }, [exam, grade, subject]); // eslint-disable-line

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: chs } = await supabase
        .from('chapters')
        .select('id, chapter_name, name, subject, class_level, exam_relevance')
        .eq('class_level', Number(grade))
        .ilike('subject', subject)
        .order('chapter_number', { ascending: true });

      const filtered = (chs || []).filter(c =>
        !c.exam_relevance || c.exam_relevance.length === 0 ||
        c.exam_relevance.some((e: string) => e.toUpperCase().includes(exam.toUpperCase()))
      );
      const deduped = dedupeChapters(filtered);
      setChapters(deduped);

      const chIds = deduped.map(c => c.id);
      if (chIds.length === 0) { setTopics([]); setNotes([]); setMaps([]); setLoading(false); return; }

      const [{ data: tps }, { data: ns }, { data: ms }] = await Promise.all([
        supabase.from('topics').select('id, topic_name, name, chapter_id').in('chapter_id', chIds),
        (supabase as any).from('study_notes').select('*').in('chapter_id', chIds).order('updated_at', { ascending: false }),
        supabase.from('concept_maps').select('*').in('chapter_id', chIds).order('updated_at', { ascending: false }),
      ]);
      setTopics(tps || []);
      setNotes((ns || []) as Note[]);
      setMaps((ms || []) as ConceptMap[]);
    } catch (e: any) {
      toast.error('Failed to load: ' + e.message);
    }
    setLoading(false);
  };

  const chapterName = (c: Chapter) => c.chapter_name || c.name || 'Untitled';

  return (
    <div className="space-y-4">
      {!studyNotesEnabled && (
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>
            <strong>Feature flag <code>study_notes</code> is OFF.</strong> Students won't see notes until you enable it in Feature Flags.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" /> Notes & Concept Maps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">Exam</Label>
            <FilterPills options={EXAMS} selected={exam} onSelect={setExam} size="sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Class</Label>
            <FilterPills options={GRADES.map(g => `Class ${g}`)} selected={`Class ${grade}`} onSelect={(v) => setGrade(v.replace('Class ', ''))} size="sm" />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Subject</Label>
            <FilterPills options={[...subjects]} selected={subject} onSelect={setSubject} size="sm" />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes"><BookOpen className="w-4 h-4 mr-1" /> Short Notes ({notes.length})</TabsTrigger>
          <TabsTrigger value="maps"><Network className="w-4 h-4 mr-1" /> Concept Maps ({maps.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="notes" className="space-y-3">
          <NotesTab chapters={chapters} topics={topics} notes={notes} subject={subject} grade={Number(grade)} exam={exam} chapterName={chapterName} onChanged={loadAll} loading={loading} />
        </TabsContent>
        <TabsContent value="maps" className="space-y-3">
          <MapsTab chapters={chapters} topics={topics} maps={maps} subject={subject} chapterName={chapterName} onChanged={loadAll} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- NOTES TAB ---------------- */
function NotesTab({ chapters, topics, notes, subject, grade, exam, chapterName, onChanged, loading }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Note | null>(null);
  const [previewOpen, setPreviewOpen] = useState<Note | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const openNew = () => {
    setEditing({
      id: '', chapter_id: chapters[0]?.id || null, topic_id: null,
      title: '', subtitle: '', subject, class_level: grade, exam_relevance: [exam],
      content_md: NOTE_TEMPLATE, reading_time_minutes: 1, is_published: false,
      document_type: 'markdown', requires_pro_plus: true,
    });
    setOpen(true);
  };

  const openEdit = (n: Note) => { setEditing({ ...n }); setOpen(true); };

  const uploadDocument = async (file: File) => {
    if (!editing) return;
    if (file.size > 26214400) { toast.error('File too large (max 25MB)'); return; }
    const ext = file.name.split('.').pop()?.toLowerCase();
    const type = ext === 'pdf' ? 'pdf' : (ext === 'docx' || ext === 'doc') ? 'docx' : null;
    if (!type) { toast.error('Only PDF or Word files allowed'); return; }
    setUploading(true);
    try {
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('study-notes').upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('study-notes').getPublicUrl(path);
      let pages: number | null = null;
      if (type === 'pdf') {
        try {
          const { pdfjs } = await import('react-pdf');
          const buf = await file.arrayBuffer();
          const doc = await pdfjs.getDocument({ data: buf }).promise;
          pages = doc.numPages;
        } catch { /* ignore */ }
      }
      setEditing({ ...editing, document_url: pub.publicUrl, document_type: type, document_name: file.name, document_pages: pages });
      toast.success('Document uploaded');
    } catch (e: any) {
      toast.error('Upload failed: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  const removeDocument = () => {
    if (!editing) return;
    setEditing({ ...editing, document_url: null, document_type: 'markdown', document_name: null, document_pages: null });
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.chapter_id) { toast.error('Title & chapter required'); return; }
    const hasContent = (editing.document_url) || (editing.content_md && editing.content_md.trim().length > 0);
    if (!hasContent) { toast.error('Either upload a document or write markdown content'); return; }
    const payload: any = {
      chapter_id: editing.chapter_id,
      topic_id: editing.topic_id,
      title: editing.title,
      subtitle: editing.subtitle || null,
      subject, class_level: grade, exam_relevance: [exam],
      content_md: editing.content_md || '',
      reading_time_minutes: editing.document_pages
        ? Math.max(1, Math.ceil(editing.document_pages * 2))
        : calcReadingTime(editing.content_md || ''),
      is_published: editing.is_published,
      document_url: editing.document_url || null,
      document_type: editing.document_type || 'markdown',
      document_name: editing.document_name || null,
      document_pages: editing.document_pages || null,
      requires_pro_plus: editing.requires_pro_plus ?? true,
    };
    const { error } = editing.id
      ? await (supabase as any).from('study_notes').update(payload).eq('id', editing.id)
      : await (supabase as any).from('study_notes').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved'); setOpen(false); setEditing(null); onChanged();
  };

  const del = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    const { error } = await supabase.from('study_notes').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted'); onChanged();
  };

  const togglePublish = async (n: Note) => {
    await supabase.from('study_notes').update({ is_published: !n.is_published }).eq('id', n.id);
    onChanged();
  };

  return (
    <>
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{loading ? 'Loading...' : `${notes.length} notes in ${subject} Class ${grade}`}</p>
        <Button onClick={openNew} disabled={chapters.length === 0}><Plus className="w-4 h-4 mr-1" /> New Note</Button>
      </div>

      <div className="grid gap-2">
        {notes.map((n: Note) => {
          const ch = chapters.find((c: Chapter) => c.id === n.chapter_id);
          const fmt = (n.document_type || 'markdown').toUpperCase();
          return (
            <Card key={n.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {n.title}
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5">{fmt === 'MARKDOWN' ? 'MD' : fmt}</Badge>
                    {n.requires_pro_plus && <Badge variant="secondary" className="text-[10px] h-4 px-1.5 gap-0.5"><Crown className="w-2.5 h-2.5" /> Pro+</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {ch ? chapterName(ch) : '—'} • {n.reading_time_minutes || 1} min read
                  </div>
                </div>
                <Badge variant={n.is_published ? 'default' : 'secondary'}>{n.is_published ? 'Published' : 'Draft'}</Badge>
                <Switch checked={!!n.is_published} onCheckedChange={() => togglePublish(n)} />
                <Button size="icon" variant="ghost" onClick={() => setPreviewOpen(n)}><Eye className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => openEdit(n)}><Edit className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(n.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          );
        })}
        {notes.length === 0 && !loading && (
          <p className="text-sm text-muted-foreground text-center py-8">No notes yet. Click "New Note" to start.</p>
        )}
      </div>

      {/* Editor */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit Note' : 'New Note'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 overflow-y-auto flex-1 pr-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Chapter</Label>
                  <Select value={editing.chapter_id || ''} onValueChange={(v) => setEditing({ ...editing, chapter_id: v, topic_id: null })}>
                    <SelectTrigger><SelectValue placeholder="Select chapter" /></SelectTrigger>
                    <SelectContent>{chapters.map((c: Chapter) => <SelectItem key={c.id} value={c.id}>{chapterName(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Topic (optional)</Label>
                  <Select value={editing.topic_id || 'none'} onValueChange={(v) => setEditing({ ...editing, topic_id: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Whole chapter" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Whole chapter —</SelectItem>
                      {topics.filter((t: Topic) => t.chapter_id === editing.chapter_id).map((t: Topic) => (
                        <SelectItem key={t.id} value={t.id}>{t.topic_name || t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label>Title</Label>
                  <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Newton's Laws — Quick Theory" />
                </div>
                <div>
                  <Label>Subtitle (optional)</Label>
                  <Input value={editing.subtitle || ''} onChange={(e) => setEditing({ ...editing, subtitle: e.target.value })} placeholder="Short tagline" />
                </div>
              </div>

              {/* Document upload panel */}
              <Card className="border-dashed">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-1.5"><Upload className="w-4 h-4" /> Attach document (PDF / Word)</Label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && uploadDocument(e.target.files[0])}
                    />
                  </div>
                  {editing.document_url ? (
                    <div className="flex items-center gap-2 p-2 bg-muted/40 rounded-md">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{editing.document_name || 'document'}</div>
                        <div className="text-xs text-muted-foreground">
                          {(editing.document_type || '').toUpperCase()}
                          {editing.document_pages && ` • ${editing.document_pages} pages`}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={uploading}>Replace</Button>
                      <Button size="icon" variant="ghost" onClick={removeDocument}><X className="w-4 h-4" /></Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                      {uploading ? 'Uploading…' : 'Choose PDF or Word file'}
                    </Button>
                  )}
                  <p className="text-[11px] text-muted-foreground">Max 25 MB. PDF renders inline with zoom; Word renders as styled HTML.</p>
                </CardContent>
              </Card>

              <div>
                <Label>Markdown content {editing.document_url && <span className="text-xs text-muted-foreground">(optional fallback when document is set)</span>}</Label>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  <Textarea
                    value={editing.content_md}
                    onChange={(e) => setEditing({ ...editing, content_md: e.target.value })}
                    className="font-mono text-sm min-h-[300px]"
                  />
                  <div className="border rounded-md p-3 min-h-[300px] max-h-[300px] overflow-y-auto prose prose-sm dark:prose-invert max-w-none bg-muted/20">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editing.content_md || ''}</ReactMarkdown>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">~{calcReadingTime(editing.content_md || '')} min read</p>
              </div>

              <div className="flex items-center gap-6 flex-wrap pt-2 border-t">
                <div className="flex items-center gap-2">
                  <Switch checked={!!editing.is_published} onCheckedChange={(v) => setEditing({ ...editing, is_published: v })} />
                  <Label>Publish to students</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={editing.requires_pro_plus ?? true} onCheckedChange={(v) => setEditing({ ...editing, requires_pro_plus: v })} />
                  <Label className="flex items-center gap-1"><Crown className="w-3.5 h-3.5" /> Require Pro+ to read</Label>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student preview */}
      <Dialog open={!!previewOpen} onOpenChange={(o) => !o && setPreviewOpen(null)}>
        <DialogContent className="max-w-3xl h-[90vh] p-0 overflow-hidden flex flex-col gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0"><DialogTitle>Student Preview</DialogTitle></DialogHeader>
          {previewOpen && <DocumentViewer note={previewOpen as any} trackProgress={false} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------------- MAPS TAB (unchanged) ---------------- */
function MapsTab({ chapters, topics, maps, subject, chapterName, onChanged, loading }: any) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ConceptMap | null>(null);
  const [jsonText, setJsonText] = useState('');

  const openNew = () => {
    setEditing({ id: '', chapter_id: chapters[0]?.id || null, topic_id: null, title: '', subject, nodes: MAP_TEMPLATE.nodes, edges: MAP_TEMPLATE.edges, is_published: false });
    setJsonText(JSON.stringify({ nodes: MAP_TEMPLATE.nodes, edges: MAP_TEMPLATE.edges }, null, 2));
    setOpen(true);
  };
  const openEdit = (m: ConceptMap) => {
    setEditing({ ...m });
    setJsonText(JSON.stringify({ nodes: m.nodes, edges: m.edges }, null, 2));
    setOpen(true);
  };
  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.chapter_id) { toast.error('Title & chapter required'); return; }
    let parsed: any;
    try { parsed = JSON.parse(jsonText); } catch { toast.error('Invalid JSON'); return; }
    const payload = { chapter_id: editing.chapter_id, topic_id: editing.topic_id, title: editing.title, subject, nodes: parsed.nodes || [], edges: parsed.edges || [], is_published: editing.is_published };
    const { error } = editing.id
      ? await supabase.from('concept_maps').update(payload).eq('id', editing.id)
      : await supabase.from('concept_maps').insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success('Saved'); setOpen(false); onChanged();
  };
  const del = async (id: string) => {
    if (!confirm('Delete this concept map?')) return;
    const { error } = await supabase.from('concept_maps').delete().eq('id', id);
    if (error) { toast.error(error.message); return; }
    toast.success('Deleted'); onChanged();
  };

  return (
    <>
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">{loading ? 'Loading...' : `${maps.length} concept maps`}</p>
        <Button onClick={openNew} disabled={chapters.length === 0}><Plus className="w-4 h-4 mr-1" /> New Map</Button>
      </div>
      <div className="grid gap-2">
        {maps.map((m: ConceptMap) => {
          const ch = chapters.find((c: Chapter) => c.id === m.chapter_id);
          const nodeCount = Array.isArray(m.nodes) ? m.nodes.length : 0;
          return (
            <Card key={m.id}>
              <CardContent className="p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{ch ? chapterName(ch) : '—'} • {nodeCount} nodes</div>
                </div>
                <Badge variant={m.is_published ? 'default' : 'secondary'}>{m.is_published ? 'Published' : 'Draft'}</Badge>
                <Button size="icon" variant="ghost" onClick={() => openEdit(m)}><Edit className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => del(m.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          );
        })}
        {maps.length === 0 && !loading && <p className="text-sm text-muted-foreground text-center py-8">No concept maps yet.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit Concept Map' : 'New Concept Map'}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Chapter</Label>
                  <Select value={editing.chapter_id || ''} onValueChange={(v) => setEditing({ ...editing, chapter_id: v, topic_id: null })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{chapters.map((c: Chapter) => <SelectItem key={c.id} value={c.id}>{chapterName(c)}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Topic (optional)</Label>
                  <Select value={editing.topic_id || 'none'} onValueChange={(v) => setEditing({ ...editing, topic_id: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Whole chapter —</SelectItem>
                      {topics.filter((t: Topic) => t.chapter_id === editing.chapter_id).map((t: Topic) => (
                        <SelectItem key={t.id} value={t.id}>{t.topic_name || t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Title</Label>
                <Input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </div>
              <div>
                <Label>Nodes & Edges (JSON)</Label>
                <Textarea value={jsonText} onChange={(e) => setJsonText(e.target.value)} className="font-mono text-xs min-h-[300px]" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!editing.is_published} onCheckedChange={(v) => setEditing({ ...editing, is_published: v })} />
                <Label>Publish to students</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save}>Save Map</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
