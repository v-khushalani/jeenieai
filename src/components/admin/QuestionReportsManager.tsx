import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, Eye, Trash2, RefreshCw, Edit, Save, X, ImageOff, ShieldCheck, FolderInput } from 'lucide-react';
import { MathDisplay } from './MathDisplay';
import MoveQuestionsDialog from './MoveQuestionsDialog';

interface QuestionReport {
  id: string;
  question_id: string;
  user_id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  question_text?: string;
  question_subject?: string;
  reporter_name?: string;
}

interface QuestionEditData {
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option: string;
  explanation: string;
}

const REASON_LABELS: Record<string, string> = {
  wrong_answer: 'Wrong Answer',
  wrong_options: 'Wrong Options',
  unclear_question: 'Unclear Question',
  wrong_explanation: 'Wrong Explanation',
  missing_diagram: 'Missing Diagram',
  duplicate: 'Duplicate',
  other: 'Other',
};

export const QuestionReportsManager: React.FC = () => {
  const [reports, setReports] = useState<QuestionReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editData, setEditData] = useState<QuestionEditData | null>(null);
  const [saving, setSaving] = useState(false);
  const [movingQuestionId, setMovingQuestionId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('question_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;

      const questionIds = [...new Set((data || []).map(r => r.question_id))];
      const userIds = [...new Set((data || []).map(r => r.user_id))];

      const [questionsRes, profilesRes] = await Promise.all([
        questionIds.length > 0
          ? supabase.from('questions').select('id, question, subject').in('id', questionIds)
          : Promise.resolve({ data: [] }),
        userIds.length > 0
          ? supabase.rpc('admin_get_profiles_by_ids' as any, { p_user_ids: userIds })
          : Promise.resolve({ data: [] }),
      ]);

      const qMap = new Map((questionsRes.data || []).map(q => [q.id, q]));
      const pMap = new Map(((profilesRes.data as any[]) || []).map((p: any) => [p.id, p]));

      setReports(
        (data || []).map(r => ({
          ...r,
          question_text: qMap.get(r.question_id)?.question || 'Unknown',
          question_subject: qMap.get(r.question_id)?.subject || '',
          reporter_name: pMap.get(r.user_id)?.full_name || pMap.get(r.user_id)?.email || 'Unknown',
        }))
      );
    } catch {
      toast.error('Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadReports(); }, [loadReports]);

  const updateStatus = async (reportId: string, newStatus: string, questionId?: string) => {
    const { error } = await supabase
      .from('question_reports')
      .update({ status: newStatus })
      .eq('id', reportId);
    if (error) { toast.error('Failed to update'); return; }
    toast.success(`Report marked as ${newStatus}`);
    loadReports();
  };

  const approveAndReactivate = async (reportId: string, questionId: string) => {
    // Reactivate + verify the question
    const { error: qErr } = await supabase
      .from('questions')
      .update({ is_active: true, is_verified: true })
      .eq('id', questionId);
    if (qErr) { toast.error('Failed to reactivate question'); return; }
    
    // Mark report as resolved
    await updateStatus(reportId, 'resolved', questionId);
    toast.success('Question approved, verified & reactivated!');
  };

  const startEditing = async (questionId: string) => {
    const { data, error } = await supabase
      .from('questions')
      .select('question, option_a, option_b, option_c, option_d, correct_option, explanation')
      .eq('id', questionId)
      .single();
    if (error || !data) { toast.error('Failed to load question'); return; }
    setEditData({
      question: data.question,
      option_a: data.option_a,
      option_b: data.option_b,
      option_c: data.option_c,
      option_d: data.option_d,
      correct_option: data.correct_option,
      explanation: data.explanation || '',
    });
    setEditingQuestionId(questionId);
  };

  const saveEdit = async () => {
    if (!editingQuestionId || !editData) return;
    setSaving(true);
    const { error } = await supabase
      .from('questions')
      .update({
        question: editData.question,
        option_a: editData.option_a,
        option_b: editData.option_b,
        option_c: editData.option_c,
        option_d: editData.option_d,
        correct_option: editData.correct_option,
        explanation: editData.explanation || null,
      })
      .eq('id', editingQuestionId);
    setSaving(false);
    if (error) { toast.error('Failed to save'); return; }
    toast.success('Question updated!');
    setEditingQuestionId(null);
    setEditData(null);
    loadReports();
  };

  const pendingCount = reports.filter(r => r.status === 'pending').length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Question Reports
            {pendingCount > 0 && (
              <Badge variant="destructive" className="text-xs">{pendingCount} pending</Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={loadReports}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            No reports found.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Question</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="text-xs">Reporter</TableHead>
                  <TableHead className="text-xs">Date</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => (
                  <React.Fragment key={report.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                    >
                      <TableCell className="max-w-[200px]">
                        <div className="text-xs truncate">{report.question_text?.substring(0, 80)}</div>
                        {report.question_subject && (
                          <Badge variant="outline" className="text-[9px] mt-1">{report.question_subject}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${report.reason === 'missing_diagram' ? 'border-orange-400 text-orange-600' : ''}`}>
                          {report.reason === 'missing_diagram' && <ImageOff className="w-3 h-3 mr-1" />}
                          {REASON_LABELS[report.reason] || report.reason}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{report.reporter_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(report.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={`text-[10px] ${
                            report.status === 'pending' ? 'bg-amber-100 text-amber-700' :
                            report.status === 'resolved' ? 'bg-green-100 text-green-700' :
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {report.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {report.status === 'pending' && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-green-600" title="Approve & Reactivate"
                                onClick={(e) => { e.stopPropagation(); approveAndReactivate(report.id, report.question_id); }}>
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-amber-600" title="Mark Resolved (keep inactive)"
                                onClick={(e) => { e.stopPropagation(); updateStatus(report.id, 'resolved'); }}>
                                <CheckCircle className="w-3.5 h-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground" title="Dismiss"
                                onClick={(e) => { e.stopPropagation(); updateStatus(report.id, 'dismissed'); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-purple-600" title="Move to another chapter"
                            onClick={(e) => { e.stopPropagation(); setMovingQuestionId(report.question_id); }}>
                            <FolderInput className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600" title="Edit Question"
                            onClick={(e) => { e.stopPropagation(); setExpandedId(report.id); startEditing(report.question_id); }}>
                            <Edit className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="View Question"
                            onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === report.id ? null : report.id); }}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedId === report.id && (
                      <TableRow>
                        <TableCell colSpan={6} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            {editingQuestionId === report.question_id && editData ? (
                              <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold">Edit Question</span>
                                  <div className="flex gap-1">
                                    <Button size="sm" variant="default" className="h-7 text-xs" disabled={saving} onClick={saveEdit}>
                                      <Save className="w-3 h-3 mr-1" />{saving ? 'Saving...' : 'Save'}
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditingQuestionId(null); setEditData(null); }}>
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] font-medium text-muted-foreground">Question</label>
                                  <textarea className="w-full text-sm border rounded-lg p-2 bg-background resize-none h-20 mt-1"
                                    value={editData.question} onChange={e => setEditData({ ...editData, question: e.target.value })} />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map((key, i) => (
                                    <div key={key}>
                                      <label className="text-[10px] font-medium text-muted-foreground">Option {String.fromCharCode(65 + i)}</label>
                                      <input className="w-full text-sm border rounded-lg p-2 bg-background mt-1"
                                        value={editData[key]} onChange={e => setEditData({ ...editData, [key]: e.target.value })} />
                                    </div>
                                  ))}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-[10px] font-medium text-muted-foreground">Correct Option</label>
                                    <select className="w-full text-sm border rounded-lg p-2 bg-background mt-1"
                                      value={editData.correct_option} onChange={e => setEditData({ ...editData, correct_option: e.target.value })}>
                                      <option value="A">A</option><option value="B">B</option>
                                      <option value="C">C</option><option value="D">D</option>
                                    </select>
                                  </div>
                                </div>
                                <div>
                                  <label className="text-[10px] font-medium text-muted-foreground">Explanation</label>
                                  <textarea className="w-full text-sm border rounded-lg p-2 bg-background resize-none h-16 mt-1"
                                    value={editData.explanation} onChange={e => setEditData({ ...editData, explanation: e.target.value })} />
                                </div>
                              </div>
                            ) : (
                              <>
                                <div className="text-xs font-medium">Full Question:</div>
                                <div className="text-sm bg-background rounded-lg p-3 border">
                                  <MathDisplay text={report.question_text || ''} />
                                </div>
                                {report.description && (
                                  <div>
                                    <div className="text-xs font-medium mt-2">User Description:</div>
                                    <p className="text-sm text-muted-foreground">{report.description}</p>
                                  </div>
                                )}
                                <Button size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => startEditing(report.question_id)}>
                                  <Edit className="w-3 h-3 mr-1" /> Edit this question
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <MoveQuestionsDialog
        open={!!movingQuestionId}
        onOpenChange={(o) => { if (!o) setMovingQuestionId(null); }}
        questionIds={movingQuestionId ? [movingQuestionId] : []}
        onMoved={loadReports}
      />
    </Card>
  );
};
