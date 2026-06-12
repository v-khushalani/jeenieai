import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import {
  Plus, Edit2, Trash2, Save, IndianRupee, GraduationCap, Loader2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { normalizeProgram, PROGRAM_SUBJECTS } from '@/utils/programConfig';

interface BatchSubject { id: string; subject: string; display_order: number }

interface Batch {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  grade: number;
  exam_type: string;
  price: number;
  offer_price: number | null;
  validity_days: number;
  is_active: boolean;
  is_free: boolean;
  color: string | null;
  display_order: number | null;
  batch_subjects?: BatchSubject[];
}

const SUBJECT_OPTIONS = PROGRAM_SUBJECTS['Class'];

const defaultForm = () => ({
  name: '', slug: '', description: '', grade: 11, exam_type: 'JEE',
  price: 0, offer_price: null as number | null, validity_days: 365,
  is_active: true, is_free: true, subjects: [] as string[],
});

export const BatchManager: React.FC = () => {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Batch | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultForm());
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  useEffect(() => { fetchBatches(); }, []);

  const fetchBatches = async () => {
    try {
      const { data, error } = await supabase
        .from('batches')
        .select('*, batch_subjects(id, subject, display_order)')
        .order('grade', { ascending: true })
        .order('exam_type', { ascending: true });
      if (error) throw error;
      setBatches((data as unknown as Batch[]) || []);
    } catch (e: any) {
      toast.error('Failed to load batches');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm());
    setDialogOpen(true);
  };

  const openEdit = (b: Batch) => {
    setEditing(b);
    setForm({
      name: b.name, slug: b.slug || '', description: b.description || '',
      grade: b.grade, exam_type: b.exam_type, price: b.price,
      offer_price: b.offer_price, validity_days: b.validity_days,
      is_active: b.is_active, is_free: b.is_free ?? true,
      subjects: b.batch_subjects?.map(s => s.subject) || [],
    });
    setDialogOpen(true);
  };

  const autoName = (grade: number, exam: string) =>
    `${exam} Grade ${grade}`;

  const autoSlug = (grade: number, exam: string) =>
    `${grade}-${exam.toLowerCase().replace(/\s+/g, '-')}`;

  const handleGradeExamChange = (grade: number, exam: string) => {
    const prog = normalizeProgram(exam);
    const subjects = PROGRAM_SUBJECTS[prog] || PROGRAM_SUBJECTS['Class'];
    setForm(f => ({
      ...f, grade, exam_type: exam,
      name: autoName(grade, exam), slug: autoSlug(grade, exam), subjects,
    }));
  };

  const toggleSubject = (s: string) => {
    setForm(f => ({
      ...f,
      subjects: f.subjects.includes(s) ? f.subjects.filter(x => x !== s) : [...f.subjects, s],
    }));
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        name: form.name, slug: form.slug || autoSlug(form.grade, form.exam_type),
        description: form.description || null, grade: form.grade, exam_type: form.exam_type,
        price: form.price, offer_price: form.offer_price, validity_days: form.validity_days,
        is_active: form.is_active, is_free: form.is_free, updated_at: new Date().toISOString(),
      };

      let batchId: string;
      if (editing) {
        const { error } = await supabase.from('batches').update(payload as any).eq('id', editing.id);
        if (error) throw error;
        batchId = editing.id;
      } else {
        payload.display_order = batches.length + 1;
        const { data, error } = await supabase.from('batches').insert(payload as any).select().single();
        if (error) throw error;
        batchId = data.id;
      }

      // Sync subjects
      await supabase.from('batch_subjects').delete().eq('batch_id', batchId);
      if (form.subjects.length > 0) {
        await supabase.from('batch_subjects').insert(
          form.subjects.map((s, i) => ({ batch_id: batchId, subject: s, display_order: i + 1 }))
        );
      }

      toast.success(editing ? 'Batch updated' : 'Batch created');
      setDialogOpen(false);
      fetchBatches();
    } catch (e: any) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await supabase.from('batch_subjects').delete().eq('batch_id', id);
      const { error } = await supabase.from('batches').delete().eq('id', id);
      if (error) throw error;
      toast.success('Batch deleted');
      fetchBatches();
    } catch (e: any) {
      toast.error('Delete failed: ' + e.message);
    }
  };

  const toggleActive = async (b: Batch) => {
    const { error } = await supabase.from('batches').update({ is_active: !b.is_active }).eq('id', b.id);
    if (error) { toast.error('Update failed'); return; }
    setBatches(prev => prev.map(x => x.id === b.id ? { ...x, is_active: !x.is_active } : x));
    toast.success(`Batch ${!b.is_active ? 'activated' : 'deactivated'}`);
  };

  const filtered = batches.filter(b =>
    filter === 'all' ? true : filter === 'active' ? b.is_active : !b.is_active
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Section title is shown in Admin shell header; keep explanatory text only. */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Each batch = Grade + Exam Type. Manage pricing, subjects, and access.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={openCreate} size="sm" className="gap-2">
            <Plus className="w-4 h-4" /> New Batch
          </Button>
        </div>
      </div>

      {/* Quick Info */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="cursor-pointer" onClick={() => setFilter('all')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-foreground">{batches.length}</p>
            <p className="text-xs text-muted-foreground">Total Batches</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('active')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{batches.filter(b => b.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => setFilter('inactive')}>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-muted-foreground">{batches.filter(b => !b.is_active).length}</p>
            <p className="text-xs text-muted-foreground">Inactive</p>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="w-full overflow-x-auto">
            <Table className="min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead>Exam</TableHead>
                  <TableHead>Subjects</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                      No batches found. Create one to get started.
                    </TableCell>
                  </TableRow>
                )}
                {filtered.map(b => (
                  <TableRow key={b.id} className={cn(!b.is_active && 'opacity-50')}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-primary shrink-0" />
                        <div>
                          <p className="font-medium text-foreground text-sm">{b.name}</p>
                          {b.description && (
                            <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">{b.description}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="text-xs">{b.grade}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{b.exam_type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {b.batch_subjects?.map(s => (
                          <Badge key={s.id} variant="outline" className="text-[10px] py-0">{s.subject}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {b.is_free ? (
                        <Badge className="bg-primary/10 text-primary text-xs">FREE</Badge>
                      ) : b.offer_price ? (
                        <div>
                          <span className="text-xs text-muted-foreground line-through">₹{b.price}</span>
                          <span className="ml-1 text-sm font-semibold text-foreground">₹{b.offer_price}</span>
                        </div>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">₹{b.price}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch checked={b.is_active} onCheckedChange={() => toggleActive(b)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(b.id, b.name)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Batch' : 'Create New Batch'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Grade + Exam */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Grade</Label>
                <Select
                  value={String(form.grade)}
                  onValueChange={v => handleGradeExamChange(Number(v), form.exam_type)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[6, 7, 8, 9, 10, 11, 12].map(g => (
                      <SelectItem key={g} value={String(g)}>Class {g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Exam Type</Label>
                <Select
                  value={form.exam_type}
                  onValueChange={v => handleGradeExamChange(form.grade, v)}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['Foundation', 'JEE', 'NEET'].map(e => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Name (auto-filled) */}
            <div className="space-y-1.5">
              <Label className="text-xs">Batch Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. JEE Grade 11" />
            </div>

            {/* Subjects */}
            <div className="space-y-1.5">
              <Label className="text-xs">Subjects</Label>
              <div className="flex flex-wrap gap-2">
                {SUBJECT_OPTIONS.map(s => (
                  <Button
                    key={s} type="button" variant={form.subjects.includes(s) ? 'default' : 'outline'}
                    size="sm" className="h-7 text-xs" onClick={() => toggleSubject(s)}
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            {/* Pricing */}
            <div className="space-y-3 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Free Batch</Label>
                <Switch checked={form.is_free} onCheckedChange={v => setForm(f => ({ ...f, is_free: v }))} />
              </div>
              {!form.is_free && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Price (₹)</Label>
                    <Input type="number" value={form.price}
                      onChange={e => setForm(f => ({ ...f, price: Number(e.target.value) }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Offer Price (₹)</Label>
                    <Input type="number" value={form.offer_price ?? ''}
                      placeholder="Optional"
                      onChange={e => setForm(f => ({ ...f, offer_price: e.target.value ? Number(e.target.value) : null }))} />
                  </div>
                </div>
              )}
            </div>

            {/* Validity */}
            <div className="space-y-1.5">
              <Label className="text-xs">Validity (days)</Label>
              <Input type="number" value={form.validity_days}
                onChange={e => setForm(f => ({ ...f, validity_days: Number(e.target.value) }))} />
            </div>

            {/* Active */}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Active</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" /> {editing ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
