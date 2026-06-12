import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Calendar, Save, Clock, Plus, Edit2, Trash2, Loader2, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { logger } from '@/utils/logger';
import { cn } from '@/lib/utils';

interface ExamConfig {
  id: string;
  exam_name: string;
  exam_date: string | null;
  description: string | null;
  is_active: boolean;
  registration_deadline: string | null;
}

const ExamDateManager: React.FC = () => {
  const [exams, setExams] = useState<ExamConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExamConfig | null>(null);
  const [form, setForm] = useState({
    exam_name: '', exam_date: '', description: '',
    is_active: true, registration_deadline: '',
  });

  useEffect(() => { loadExams(); }, []);

  const loadExams = async () => {
    try {
      const { data, error } = await supabase.from('exam_config').select('*').order('exam_name');
      if (error) throw error;
      setExams(((data as any[]) || []).map(d => ({ ...d, description: d.description ?? d.notes, registration_deadline: d.registration_deadline ?? d.registration_end })) as ExamConfig[]);
    } catch (e) {
      logger.error('Error loading exams:', e);
      toast.error('Failed to load exam config');
    } finally {
      setLoading(false);
    }
  };

  const getDaysUntil = (dateStr: string | null) => {
    if (!dateStr) return null;
    const diff = Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
    return diff;
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ exam_name: '', exam_date: '', description: '', is_active: true, registration_deadline: '' });
    setDialogOpen(true);
  };

  const openEdit = (exam: ExamConfig) => {
    setEditing(exam);
    setForm({
      exam_name: exam.exam_name,
      exam_date: exam.exam_date || '',
      description: exam.description || '',
      is_active: exam.is_active ?? true,
      registration_deadline: exam.registration_deadline || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.exam_name) { toast.error('Exam name is required'); return; }
    setSaving(true);
    try {
      const payload: any = {
        exam_name: form.exam_name,
        exam_code: form.exam_name.toUpperCase().replace(/\s+/g, '_'),
        exam_date: form.exam_date || null,
        notes: form.description || null,
        is_active: form.is_active,
        registration_end: form.registration_deadline || null,
        updated_at: new Date().toISOString(),
      };

      if (editing) {
        const { error } = await supabase.from('exam_config').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success(`${form.exam_name} updated`);
      } else {
        const { error } = await supabase.from('exam_config').insert(payload);
        if (error) throw error;
        toast.success(`${form.exam_name} added`);
      }

      setDialogOpen(false);
      loadExams();
    } catch (e: any) {
      toast.error('Save failed: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (exam: ExamConfig) => {
    if (!confirm(`Delete "${exam.exam_name}" config?`)) return;
    const { error } = await supabase.from('exam_config').delete().eq('id', exam.id);
    if (error) { toast.error('Delete failed'); return; }
    toast.success('Deleted');
    loadExams();
  };

  const handleQuickDateSave = async (exam: ExamConfig, newDate: string) => {
    const { error } = await supabase.from('exam_config')
      .update({ exam_date: newDate, updated_at: new Date().toISOString() })
      .eq('id', exam.id);
    if (error) { toast.error('Update failed'); return; }
    setExams(prev => prev.map(e => e.id === exam.id ? { ...e, exam_date: newDate } : e));
    toast.success(`${exam.exam_name} date updated`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Exam Configuration
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Set exam dates that sync to all student study planners automatically.
          </p>
        </div>
        <Button onClick={openCreate} size="sm" className="gap-2">
          <Plus className="w-4 h-4" /> Add Exam
        </Button>
      </div>

      {/* Exam Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {exams.map(exam => {
          const daysLeft = getDaysUntil(exam.exam_date);
          const isUrgent = daysLeft !== null && daysLeft <= 30 && daysLeft > 0;
          const isPast = daysLeft !== null && daysLeft <= 0;

          return (
            <Card key={exam.id} className={cn(
              'relative overflow-hidden transition-all',
              !exam.is_active && 'opacity-50',
              isUrgent && 'border-destructive/40',
            )}>
              <div className={cn(
                'absolute top-0 left-0 right-0 h-1',
                isPast ? 'bg-muted-foreground' : isUrgent ? 'bg-destructive' : 'bg-primary'
              )} />

              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {exam.exam_name}
                      {!exam.is_active && <Badge variant="outline" className="text-[10px]">Inactive</Badge>}
                    </CardTitle>
                    {exam.description && (
                      <p className="text-xs text-muted-foreground mt-1">{exam.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(exam)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(exam)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Exam Date with inline edit */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-[11px] text-muted-foreground mb-1">Exam Date</p>
                    <Input
                      type="date"
                      value={exam.exam_date || ''}
                      className="h-8 text-sm"
                      onChange={e => handleQuickDateSave(exam, e.target.value)}
                    />
                  </div>
                  {daysLeft !== null && (
                    <Badge variant={isPast ? 'destructive' : isUrgent ? 'destructive' : 'secondary'} className="text-xs whitespace-nowrap">
                      {isPast ? 'Passed' : `${daysLeft}d left`}
                    </Badge>
                  )}
                </div>

                {/* Registration deadline */}
                {exam.registration_deadline && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    Registration deadline: {new Date(exam.registration_deadline).toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </div>
                )}

                {/* Countdown summary */}
                {daysLeft !== null && daysLeft > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    {isUrgent ? (
                      <AlertCircle className="w-3.5 h-3.5 text-destructive" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-primary" />
                    )}
                    <span className={isUrgent ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                      {Math.floor(daysLeft / 7)} weeks, {daysLeft % 7} days remaining
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {exams.length === 0 && (
        <Card className="p-12 text-center">
          <Calendar className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg mb-2 text-foreground">No Exams Configured</h3>
          <p className="text-muted-foreground mb-4">Add exam dates to sync with study planners</p>
          <Button onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" /> Add First Exam
          </Button>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Exam' : 'Add New Exam'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Exam Name</Label>
              <Input value={form.exam_name}
                onChange={e => setForm(f => ({ ...f, exam_name: e.target.value }))}
                placeholder="e.g. JEE Main" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Exam Date</Label>
              <Input type="date" value={form.exam_date}
                onChange={e => setForm(f => ({ ...f, exam_date: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Registration Deadline</Label>
              <Input type="date" value={form.registration_deadline}
                onChange={e => setForm(f => ({ ...f, registration_deadline: e.target.value }))} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Description (optional)</Label>
              <Textarea value={form.description} rows={2}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description..." />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-xs">Active</Label>
              <Switch checked={form.is_active}
                onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
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

export default ExamDateManager;
