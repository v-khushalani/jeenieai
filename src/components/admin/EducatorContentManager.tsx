import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import {
  Upload, Loader2, FileText, Trash2, Plus, Sparkles, Search, CheckCircle2, XCircle,
} from 'lucide-react';
import { useEducatorContent, EducatorContentItem } from '@/hooks/useEducatorContent';
import { supabase } from '@/integrations/supabase/client';

const GRADES = [8, 9, 10, 11, 12];
import { PROGRAM_SUBJECTS } from '@/utils/programConfig';
const SUBJECTS = PROGRAM_SUBJECTS['Class'];

interface Chapter {
  id: string;
  chapter_name: string;
  subject: string;
}

export const EducatorContentManager: React.FC = () => {
  const { items, loading, fetchContent, uploadPresentation, addSimulation, addGame, deleteContent, reviewContent } =
    useEducatorContent();

  const [activeTab, setActiveTab] = useState<'presentation' | 'simulation' | 'game'>('presentation');
  const [approvalFilter, setApprovalFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [gradeFilter, setGradeFilter] = useState<number>(8);
  const [subjectFilter, setSubjectFilter] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Upload dialog
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<'presentation' | 'simulation' | 'game'>('presentation');
  const [uploading, setUploading] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // Form state
  const [form, setForm] = useState({
    title: '',
    description: '',
    subject: SUBJECTS[0],
    grade: 8,
    chapter_id: '',
    file: null as File | null,
    sourceType: 'url' as 'url' | 'file',
    embed_url: '',
  });

  useEffect(() => {
    fetchContent({
      content_type: activeTab,
      grade: activeTab === 'presentation' ? gradeFilter : undefined,
      approval_status: approvalFilter,
      includeInactive: true,
      subject: subjectFilter ? subjectFilter.toLowerCase() : undefined,
    });
  }, [activeTab, gradeFilter, approvalFilter, subjectFilter, fetchContent]);

  // Fetch chapters for upload form
  useEffect(() => {
    if (!form.subject) return;
    setLoadingChapters(true);
    supabase
      .from('chapters')
      .select('id, chapter_name, subject')
      .eq('subject', form.subject)
      .neq('is_active', false)
      .order('chapter_number')
      .then(({ data }) => {
        setChapters((data as Chapter[]) || []);
        setLoadingChapters(false);
      });
  }, [form.subject]);

  const filtered = React.useMemo(() => {
    let result = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (i) => i.title.toLowerCase().includes(q) || (i.description ?? '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [items, searchQuery]);

  const openUpload = (type: 'presentation' | 'simulation' | 'game') => {
    setUploadType(type);
    setForm({ title: '', description: '', subject: SUBJECTS[0], grade: 8, chapter_id: '', file: null, sourceType: 'url', embed_url: '' });
    setUploadOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;

    if (uploadType === 'presentation') {
      const validExts = ['.pdf', '.ppt', '.pptx'];
      if (!validExts.some((ext) => f.name.toLowerCase().endsWith(ext))) {
        toast.error('Please upload a PDF or PowerPoint file (.pdf, .ppt, .pptx).');
        return;
      }
    } else {
      const validExts = ['.jsx', '.tsx', '.js', '.html', '.htm'];
      if (!validExts.some((ext) => f.name.toLowerCase().endsWith(ext))) {
        toast.error(`Please upload a JSX/TSX/JS or HTML ${uploadType === 'game' ? 'game' : 'Interactive Animation'} file.`);
        return;
      }
    }
    setForm((p) => ({ ...p, file: f }));
  };

  const handleUpload = async () => {
    if (!form.title || !form.subject) {
      toast.error('Fill in all required fields.');
      return;
    }

    setUploading(true);
    let ok = false;

    if (uploadType === 'presentation') {
      if (!form.file) { toast.error('Select a PDF/PPT file.'); setUploading(false); return; }
      ok = await uploadPresentation({
        title: form.title,
        description: form.description,
        subject: form.subject,
        grade: form.grade,
        chapter_id: form.chapter_id || undefined,
        file: form.file,
      });
    } else if (uploadType === 'simulation') {
      if (form.sourceType === 'url' && !form.embed_url) { toast.error('Enter Interactive Animation URL.'); setUploading(false); return; }
      if (form.sourceType === 'file' && !form.file) { toast.error('Select Interactive Animation file.'); setUploading(false); return; }
      ok = await addSimulation({
        title: form.title,
        description: form.description,
        subject: form.subject,
        grade: form.grade,
        chapter_id: form.chapter_id || undefined,
        embed_url: form.sourceType === 'url' ? form.embed_url : undefined,
        file: form.sourceType === 'file' ? (form.file ?? undefined) : undefined,
      });
    } else {
      if (form.sourceType === 'url' && !form.embed_url) { toast.error('Enter Game URL.'); setUploading(false); return; }
      if (form.sourceType === 'file' && !form.file) { toast.error('Select Game file.'); setUploading(false); return; }
      ok = await addGame({
        title: form.title,
        description: form.description,
        subject: form.subject,
        grade: form.grade,
        chapter_id: form.chapter_id || undefined,
        embed_url: form.sourceType === 'url' ? form.embed_url : undefined,
        file: form.sourceType === 'file' ? (form.file ?? undefined) : undefined,
      });
    }

    setUploading(false);
    if (ok) {
      setUploadOpen(false);
      setApprovalFilter('pending');
      fetchContent({ content_type: activeTab, grade: activeTab === 'presentation' ? gradeFilter : undefined, approval_status: 'pending', includeInactive: true });
    }
  };

  const handleReview = async (item: EducatorContentItem, status: 'approved' | 'rejected') => {
    const notes = status === 'rejected'
      ? window.prompt('Reason for rejection (optional):') || undefined
      : undefined;

    const ok = await reviewContent(item, status, notes);
    if (ok) {
      fetchContent({
        content_type: activeTab,
        grade: activeTab === 'presentation' ? gradeFilter : undefined,
        approval_status: approvalFilter,
        includeInactive: true,
        subject: subjectFilter ? subjectFilter.toLowerCase() : undefined,
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-muted-foreground text-sm">
            Upload PPTs / Interactive Animations / games and review every submission before it goes live.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button onClick={() => openUpload('presentation')} variant="outline" className="gap-2 flex-1 sm:flex-none min-w-[140px]">
            <Upload className="h-4 w-4" /> Upload PPT
          </Button>
          <Button onClick={() => openUpload('simulation')} className="gap-2 flex-1 sm:flex-none min-w-[140px]">
            <Plus className="h-4 w-4" /> Add Animation
          </Button>
          <Button onClick={() => openUpload('game')} variant="secondary" className="gap-2 flex-1 sm:flex-none min-w-[140px]">
            <Plus className="h-4 w-4" /> Add Game
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'presentation' | 'simulation' | 'game')}>
        <div className="flex flex-wrap items-center gap-4">
          <TabsList>
            <TabsTrigger value="presentation">Presentations</TabsTrigger>
            <TabsTrigger value="simulation">Interactive Animations</TabsTrigger>
            <TabsTrigger value="game">Games</TabsTrigger>
          </TabsList>

          <Select value={approvalFilter} onValueChange={(v) => setApprovalFilter(v as 'pending' | 'approved' | 'rejected' | 'all')}>
            <SelectTrigger className="w-36 h-8">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>

          {activeTab === 'presentation' && (
            <div className="flex gap-2">
              {GRADES.map((g) => (
                <Button
                  key={g}
                  size="sm"
                  variant={gradeFilter === g ? 'default' : 'outline'}
                  onClick={() => setGradeFilter(g)}
                >
                  Gr {g}
                </Button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Select value={subjectFilter || 'all'} onValueChange={(v) => setSubjectFilter(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-36 h-8">
                <SelectValue placeholder="All subjects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subjects</SelectItem>
                {SUBJECTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9 h-8" placeholder="Search…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <TabsContent value="presentation" className="mt-4">
          <ContentGrid items={filtered} loading={loading} onDelete={deleteContent} onReview={handleReview} type="presentation" />
        </TabsContent>
        <TabsContent value="simulation" className="mt-4">
          <ContentGrid items={filtered} loading={loading} onDelete={deleteContent} onReview={handleReview} type="simulation" />
        </TabsContent>
        <TabsContent value="game" className="mt-4">
          <ContentGrid items={filtered} loading={loading} onDelete={deleteContent} onReview={handleReview} type="game" />
        </TabsContent>
      </Tabs>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {uploadType === 'presentation' ? 'Upload Presentation' : uploadType === 'simulation' ? 'Add Interactive Animation' : 'Add Game'}
            </DialogTitle>
            <DialogDescription>
              {uploadType === 'presentation'
                ? 'Upload a PDF or PowerPoint file. Only educators can view this.'
                : uploadType === 'simulation'
                  ? 'Upload an HTML Interactive Animation file, embed a PhET/GeoGebra URL, or upload a JSX/TSX React component.'
                  : 'Upload an HTML game file, embed a game URL, or upload a JSX/TSX React game component.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="e.g. Kinematics - Motion" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Grade <span className="text-destructive">*</span></Label>
                <Select value={String(form.grade)} onValueChange={(v) => setForm((p) => ({ ...p, grade: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GRADES.map((g) => <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Subject <span className="text-destructive">*</span></Label>
                <Select value={form.subject} onValueChange={(v) => setForm((p) => ({ ...p, subject: v, chapter_id: '' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUBJECTS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {uploadType === 'presentation' && (
              <div className="space-y-1">
                <Label>Chapter (optional)</Label>
                <Select value={form.chapter_id || 'none'} onValueChange={(v) => setForm((p) => ({ ...p, chapter_id: v === 'none' ? '' : v }))} disabled={loadingChapters || chapters.length === 0}>
                  <SelectTrigger><SelectValue placeholder={loadingChapters ? 'Loading…' : 'Link to a chapter'} /></SelectTrigger>
                  <SelectContent>
                    <ScrollArea className="h-48">
                      <SelectItem value="none">No chapter</SelectItem>
                      {chapters.map((c) => <SelectItem key={c.id} value={c.id}>{c.chapter_name}</SelectItem>)}
                    </ScrollArea>
                  </SelectContent>
                </Select>
              </div>
            )}

            {(uploadType === 'simulation' || uploadType === 'game') && (
              <div className="space-y-2">
                <Label>{uploadType === 'game' ? 'Game Source' : 'Interactive Animation Source'} <span className="text-destructive">*</span></Label>
                <RadioGroup value={form.sourceType} onValueChange={(v) => setForm((p) => ({ ...p, sourceType: v as 'url' | 'file' }))} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="url" id="src-url" />
                    <Label htmlFor="src-url" className="cursor-pointer font-normal">Embed URL</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="file" id="src-file" />
                    <Label htmlFor="src-file" className="cursor-pointer font-normal">Upload JSX File</Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {(uploadType === 'simulation' || uploadType === 'game') && form.sourceType === 'url' ? (
              <div className="space-y-1">
                <Label>{uploadType === 'game' ? 'Game URL' : 'Interactive Animation URL'} <span className="text-destructive">*</span></Label>
                <Input value={form.embed_url} onChange={(e) => setForm((p) => ({ ...p, embed_url: e.target.value }))} placeholder={uploadType === 'game' ? 'https://example.com/your-game' : 'https://phet.colorado.edu/sims/html/…'} type="url" />
              </div>
            ) : null}

            {(uploadType === 'presentation' || ((uploadType === 'simulation' || uploadType === 'game') && form.sourceType === 'file')) && (
              <div className="space-y-1">
                <Label>{uploadType === 'presentation' ? 'PDF / PPT File' : uploadType === 'game' ? 'Game File (HTML / JSX / TSX / JS)' : 'HTML / JSX / TSX / JS File'} <span className="text-destructive">*</span></Label>
                <div className="border-2 border-dashed rounded-lg p-4 text-center hover:border-primary/50 transition-colors">
                  <Input
                    type="file"
                    accept={uploadType === 'presentation' ? '.pdf,.ppt,.pptx,application/pdf,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation' : '.html,.htm,.jsx,.tsx,.js,text/html,text/javascript,application/javascript'}
                    id="admin-content-upload"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <label htmlFor="admin-content-upload" className="cursor-pointer">
                    {form.file ? (
                      <p className="text-sm font-medium text-primary">{form.file.name}</p>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-muted-foreground">
                        <Upload className="h-8 w-8" />
                        <span className="text-sm">Click to select file</span>
                      </div>
                    )}
                  </label>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading || !form.title}>
                {uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Uploading…</> : 'Upload'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Sub-component: content grid
const ContentGrid: React.FC<{
  items: EducatorContentItem[];
  loading: boolean;
  onDelete: (item: EducatorContentItem) => void;
  onReview: (item: EducatorContentItem, status: 'approved' | 'rejected') => void;
  type: string;
}> = ({ items, loading, onDelete, onReview, type }) => {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-2">
          {type === 'presentation' ? <FileText className="h-10 w-10 text-muted-foreground" /> : <Sparkles className="h-10 w-10 text-muted-foreground" />}
          <p className="text-muted-foreground text-sm">No {type === 'presentation' ? 'presentations' : type === 'game' ? 'games' : 'virtual lab items'} found.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {items.map((item) => (
        <Card key={item.id} className="hover:shadow-xs transition-shadow">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="secondary" className="text-[10px]">
                Grade {item.grade}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {item.subject.charAt(0).toUpperCase() + item.subject.slice(1)}
              </Badge>
                <Badge
                  variant="outline"
                  className={
                    item.approval_status === 'approved'
                      ? 'text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50'
                      : item.approval_status === 'rejected'
                      ? 'text-[10px] border-destructive/40 text-destructive bg-destructive/10'
                      : 'text-[10px] border-amber-300 text-amber-700 bg-amber-50'
                  }
                >
                  {item.approval_status}
                </Badge>
            </div>
            <CardTitle className="text-sm leading-snug">{item.title}</CardTitle>
            {item.description && <CardDescription className="text-xs line-clamp-2">{item.description}</CardDescription>}
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2">
              {item.approval_status !== 'approved' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 flex-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                  onClick={() => onReview(item, 'approved')}
                >
                  <CheckCircle2 className="h-3 w-3" /> Approve
                </Button>
              )}
              {item.approval_status !== 'rejected' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1 flex-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => onReview(item, 'rejected')}
                >
                  <XCircle className="h-3 w-3" /> Reject
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 gap-1"
                onClick={() => onDelete(item)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default EducatorContentManager;
