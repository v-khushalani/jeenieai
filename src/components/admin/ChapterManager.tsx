import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';

import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GripVertical, Lock, Unlock, BookOpen, GraduationCap, Plus, Edit, Trash2, ArrowRightLeft, MoveRight, Loader2 } from 'lucide-react';
import { logger } from '@/utils/logger';
import { getSubjectAliases } from '@/lib/subjectNormalization';
import { normalizeProgram, PROGRAM_SUBJECTS } from '@/utils/programConfig';

const SUBJECT_CODE_BY_NAME: Record<string, string> = {
  Physics: 'PHYSICS',
  Chemistry: 'CHEMISTRY',
  Mathematics: 'MATHEMATICS',
  Biology: 'BIOLOGY',
};

const slugifyChapterPart = (value: string) => value
  .trim()
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/[^\w-]/g, '')
  .replace(/-+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 80);

interface Batch {
  id: string;
  name: string;
  exam_type: string;
  grade: number;
}

interface Chapter {
  id: string;
  chapter_name: string;
  chapter_number: number;
  subject: string;
  description: string | null;
  is_free: boolean | null;
  batch_id: string | null;
  topic_count?: number;
  question_count?: number;
}

// ─── Shared chapter row content (used both in sortable and DragOverlay) ──────

interface ChapterRowContentProps {
  chapter: Chapter;
  getBatchName: (batchId: string) => string;
  isSelected?: boolean;
  onToggleSelected?: (id: string, checked: boolean) => void;
  toggleFreeStatus?: (id: string, current: boolean | null) => void;
  openMoveDialog?: (chapter: Chapter) => void;
  openEditDialog?: (chapter: Chapter) => void;
  handleDeleteChapter?: (id: string) => void;
  openMoveQuestionsDialog?: (chapter: Chapter) => void;
  quickMoveLabel?: string;
  onQuickMove?: (chapter: Chapter) => void;
  isDragging?: boolean;
}

const ChapterRowContent: React.FC<ChapterRowContentProps> = ({
  chapter, getBatchName, toggleFreeStatus, openMoveDialog, openEditDialog, handleDeleteChapter,
  openMoveQuestionsDialog, quickMoveLabel, onQuickMove, isDragging, isSelected, onToggleSelected,
}) => (
  <>
    {!isDragging && onToggleSelected && (
      <Checkbox
        checked={!!isSelected}
        onCheckedChange={(checked) => onToggleSelected(chapter.id, checked === true)}
        aria-label={`Select chapter ${chapter.chapter_name}`}
        className="shrink-0"
      />
    )}

    {/* Chapter Number pill */}
    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
      {chapter.chapter_number ?? '–'}
    </div>

    {/* Chapter Info */}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="font-medium truncate">{chapter.chapter_name}</p>
        <Badge variant="outline" className="text-xs shrink-0">
          {chapter.batch_id ? getBatchName(chapter.batch_id) : 'Unknown'}
        </Badge>
      </div>
      {chapter.description && (
        <p className="text-xs text-muted-foreground truncate">{chapter.description}</p>
      )}
      <div className="mt-1 flex items-center gap-2 flex-wrap">
        <Badge variant="secondary" className="text-[10px] h-5 px-2">
          {chapter.topic_count ?? 0} topics
        </Badge>
        <Badge variant="secondary" className="text-[10px] h-5 px-2">
          {chapter.question_count ?? 0} questions
        </Badge>
      </div>
    </div>

    {/* Free/Premium Toggle */}
    {!isDragging && toggleFreeStatus && (
      <Badge
        className={`cursor-pointer shrink-0 text-white ${chapter.is_free ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}
        onClick={() => toggleFreeStatus(chapter.id, chapter.is_free)}
      >
        {chapter.is_free
          ? <span className="flex items-center gap-1"><Unlock className="w-3 h-3" />Free</span>
          : <span className="flex items-center gap-1"><Lock className="w-3 h-3" />Premium</span>}
      </Badge>
    )}

    {/* Quick Grade Move */}
    {!isDragging && quickMoveLabel && onQuickMove && (
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 text-xs h-7 px-2 gap-1"
        onClick={() => onQuickMove(chapter)}
      >
        <ArrowRightLeft className="w-3 h-3" />
        {quickMoveLabel}
      </Button>
    )}

    {/* Action Buttons */}
    {!isDragging && openMoveDialog && openEditDialog && handleDeleteChapter && (
      <div className="flex items-center gap-1 shrink-0">
        {openMoveQuestionsDialog && (
          <Button variant="ghost" size="icon" title="Move questions to another chapter" onClick={() => openMoveQuestionsDialog(chapter)}>
            <MoveRight className="w-4 h-4 text-blue-600" />
          </Button>
        )}
        <Button variant="ghost" size="icon" title="Move to different batch/subject" onClick={() => openMoveDialog(chapter)}>
          <ArrowRightLeft className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => openEditDialog(chapter)}>
          <Edit className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteChapter(chapter.id)}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    )}
  </>
);

// ─── Sortable wrapper ────────────────────────────────────────────────────────

interface SortableChapterItemProps extends ChapterRowContentProps {
  chapter: Chapter;
}

const SortableChapterItem: React.FC<SortableChapterItemProps> = (props) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.chapter.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: transition ?? undefined,
        opacity: isDragging ? 0.4 : 1,
        position: 'relative',
        zIndex: isDragging ? 50 : 'auto',
      }}
      className={`flex items-center gap-3 p-3 border rounded-lg bg-card transition-colors ${isDragging ? 'shadow-lg' : 'hover:bg-accent/40'}`}
    >
      {/* Drag Handle — only this area activates the drag */}
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none shrink-0 p-1 rounded hover:bg-muted"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-5 h-5 text-muted-foreground" />
      </div>
      <ChapterRowContent {...props} isDragging={false} />
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────

const ChapterManager = () => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('Physics');

  // Grade-first filter: grades 6-10 = Foundation, 11-12 = JEE or NEET
  const [gradeFilter, setGradeFilter] = useState<number>(12);
  const [examFilter, setExamFilter] = useState<'JEE' | 'NEET'>('JEE');

  // Derived from gradeFilter + examFilter (for compatibility with existing helpers)
  const filterExam = gradeFilter <= 10 ? `Foundation-${gradeFilter}` : examFilter;
  const selectedGrade: number | null = gradeFilter >= 11 ? gradeFilter : null;

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isMoveDialogOpen, setIsMoveDialogOpen] = useState(false);
  const [isMoveQuestionsDialogOpen, setIsMoveQuestionsDialogOpen] = useState(false);
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteMode, setBulkDeleteMode] = useState<'questions' | 'topics' | 'all'>('all');
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  const [bulkDeleteStats, setBulkDeleteStats] = useState({ topics: 0, questions: 0 });
  const [moveQuestionsSource, setMoveQuestionsSource] = useState<Chapter | null>(null);
  const [moveQuestionsTargetId, setMoveQuestionsTargetId] = useState<string>('');
  const [moveQuestionsCount, setMoveQuestionsCount] = useState<number>(0);
  const [movingQuestions, setMovingQuestions] = useState(false);
  const [allChaptersForMove, setAllChaptersForMove] = useState<{ id: string; chapter_name: string; subject: string; batch_name: string }[]>([]);
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [movingChapter, setMovingChapter] = useState<Chapter | null>(null);
  const [moveTarget, setMoveTarget] = useState({ exam: '', grade: 0, subject: '' });
  const [isBulkMoveDialogOpen, setIsBulkMoveDialogOpen] = useState(false);
  const [bulkMoveTarget, setBulkMoveTarget] = useState({ exam: 'NEET', grade: 12, subject: 'Physics' });
  const [bulkMoveLoading, setBulkMoveLoading] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    chapter_name: '',
    chapter_number: 1,
    description: '',
    is_free: true
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Get valid subjects based on exam type using canonical program mapping
  const validSubjects = useMemo(() => {
    const prog = normalizeProgram(filterExam);
    return PROGRAM_SUBJECTS[prog] || PROGRAM_SUBJECTS['Class'];
  }, [filterExam]);

  const toggleSubjectFilter = useCallback((subject: string) => {
    setSelectedSubject(subject);
  }, []);

  // Reset subject if not valid for current exam
  useEffect(() => {
    // Keep selected subject valid for the current exam; reset if invalid
    if (!validSubjects.includes(selectedSubject)) {
      setSelectedSubject(validSubjects[0] || 'Physics');
    }
  }, [filterExam, validSubjects, selectedSubject]);

  useEffect(() => {
    fetchBatches();
  }, []);

  // Note: fetchChapters useEffect moved after its useCallback definition below

  const fetchBatches = async () => {
    const { data } = await supabase
      .from('batches')
      .select('id, name, exam_type, grade')
      .order('grade');
    setBatches(data || []);
    logger.info('Fetched batches', { count: data?.length || 0 });
  };

  // Get batch_id for current filter - ALL chapters must be linked to a batch
  const getCurrentBatchId = useCallback((): string | 'NOT_FOUND' => {
    if (filterExam === 'JEE') {
      const batch = batches.find(b => 
        b.exam_type.toLowerCase() === 'jee' && 
        (!selectedGrade || b.grade === selectedGrade)
      );
      return batch?.id || 'NOT_FOUND';
    }
    
    if (filterExam === 'NEET') {
      const batch = batches.find(b => 
        b.exam_type.toLowerCase() === 'neet' && 
        (!selectedGrade || b.grade === selectedGrade)
      );
      return batch?.id || 'NOT_FOUND';
    }
    
    if (filterExam.startsWith('Foundation-')) {
      const grade = parseInt(filterExam.replace('Foundation-', ''));
      const batch = batches.find(b => b.exam_type.toLowerCase() === 'foundation' && b.grade === grade);
      return batch?.id || 'NOT_FOUND';
    }
    
    return 'NOT_FOUND';
  }, [filterExam, batches, selectedGrade]);

  // Get batch name for display
  const getBatchName = (batchId: string): string => {
    const batch = batches.find(b => b.id === batchId);
    if (!batch) return 'Unknown';
    if (batch.exam_type.toLowerCase() === 'foundation') return `${batch.grade}th Foundation`;
    return batch.name || batch.exam_type;
  };

  const fetchChapters = useCallback(async () => {
    const batchId = getCurrentBatchId();

    if (batchId === 'NOT_FOUND') {
      setChapters([]);
      return;
    }

    // Normalize selectedSubject to an array (backwards compatible)
    const subjectsArray = Array.isArray(selectedSubject) ? selectedSubject : [selectedSubject];
    if (!subjectsArray || subjectsArray.length === 0) {
      setChapters([]);
      return;
    }

    // DB may contain either display labels (Physics) or canonical import codes (PHYSICS).
    const aliases = Array.from(new Set(subjectsArray.flatMap(s => {
      const displayAliases = getSubjectAliases(s);
      return [...displayAliases, ...displayAliases.map((alias) => SUBJECT_CODE_BY_NAME[alias] || alias.toUpperCase())];
    })));

    const { data: chapterRows } = await supabase
      .from('chapters')
      .select('*')
      .in('subject', aliases)
      .eq('batch_id', batchId)
      .order('chapter_number');

    const chapterIds = (chapterRows || []).map((chapter) => chapter.id);

    const topicRowsResult = chapterIds.length
      ? await supabase.from('topics').select('chapter_id').in('chapter_id', chapterIds)
      : { data: [] as Array<{ chapter_id: string }> };

    // Use HEAD count queries per chapter — accurate even beyond the 1000-row PostgREST cap.
    const internalQuestionCountsById = new Map<string, number>();
    const publicQuestionCountsById = new Map<string, number>();

    await Promise.all(
      chapterIds.map(async (chId) => {
        const [internalRes, publicRes] = await Promise.all([
          supabase
            .from('questions')
            .select('id', { count: 'exact', head: true })
            .eq('chapter_id', chId),
          supabase
            .from('questions_public')
            .select('id', { count: 'exact', head: true })
            .eq('chapter_id', chId),
        ]);
        internalQuestionCountsById.set(chId, internalRes.count || 0);
        publicQuestionCountsById.set(chId, publicRes.count || 0);
      })
    );

    const topicCounts = new Map<string, number>();
    (topicRowsResult.data || []).forEach((topic) => {
      topicCounts.set(topic.chapter_id, (topicCounts.get(topic.chapter_id) || 0) + 1);
    });

    const publicQuestionCountsByName = new Map<string, number>();
    const internalQuestionCountsByName = new Map<string, number>();
    const normalizeChapterTitle = (value: string | null | undefined) => (value || '').trim().toLowerCase();

    setChapters((chapterRows || []).map((chapter) => {
      const chapterName = chapter.chapter_name || chapter.name || 'Untitled Chapter';
      const chapterKey = normalizeChapterTitle(chapterName);
      const publicCount = publicQuestionCountsById.get(chapter.id) ?? publicQuestionCountsByName.get(chapterKey) ?? 0;
      const internalCount = internalQuestionCountsById.get(chapter.id) ?? internalQuestionCountsByName.get(chapterKey) ?? 0;

      return {
        ...chapter,
        chapter_name: chapterName,
        topic_count: topicCounts.get(chapter.id) || 0,
        question_count: publicCount > 0 ? publicCount : internalCount,
      };
    }));
  }, [selectedSubject, getCurrentBatchId, filterExam]);

  useEffect(() => {
    fetchChapters();
  }, [fetchChapters]);

  useEffect(() => {
    setSelectedChapterIds((prev) => prev.filter((id) => chapters.some((chapter) => chapter.id === id)));
  }, [chapters]);

  const normalizeKey = useCallback((value: string | null | undefined) => (value || '').trim().toLowerCase(), []);

  

  const handleDeleteChapter = async (chapterId: string) => {
    if (!confirm('Are you sure you want to delete this chapter?')) return;

    const { error } = await supabase
      .from('chapters')
      .delete()
      .eq('id', chapterId);

    if (error) {
      toast.error('Failed to delete chapter');
      logger.error('Failed to delete chapter', error);
      return;
    }

    toast.success('Chapter deleted successfully');
    fetchChapters();
  };

  const toggleChapterSelection = useCallback((chapterId: string, checked: boolean) => {
    setSelectedChapterIds((prev) => {
      if (checked) {
        if (prev.includes(chapterId)) return prev;
        return [...prev, chapterId];
      }
      return prev.filter((id) => id !== chapterId);
    });
  }, []);

  const toggleSelectAllChapters = useCallback((checked: boolean) => {
    setSelectedChapterIds(checked ? chapters.map((chapter) => chapter.id) : []);
  }, [chapters]);

  const refreshBulkDeleteStats = useCallback(async (chapterIds: string[]) => {
    if (chapterIds.length === 0) {
      setBulkDeleteStats({ topics: 0, questions: 0 });
      return;
    }

    const [topicCountRes, questionCountRes] = await Promise.all([
      supabase.from('topics').select('id', { count: 'exact', head: true }).in('chapter_id', chapterIds),
      supabase.from('questions').select('id', { count: 'exact', head: true }).in('chapter_id', chapterIds),
    ]);

    setBulkDeleteStats({
      topics: topicCountRes.count || 0,
      questions: questionCountRes.count || 0,
    });
  }, []);

  const handleOpenBulkDeleteDialog = useCallback(async () => {
    if (selectedChapterIds.length === 0) {
      toast.error('Select at least one chapter first');
      return;
    }
    await refreshBulkDeleteStats(selectedChapterIds);
    setBulkDeleteMode('all');
    setIsBulkDeleteDialogOpen(true);
  }, [refreshBulkDeleteStats, selectedChapterIds]);

  const handleBulkDelete = useCallback(async () => {
    if (selectedChapterIds.length === 0) {
      toast.error('No chapters selected');
      return;
    }

    const confirmMessage = bulkDeleteMode === 'questions'
      ? `Delete all questions inside ${selectedChapterIds.length} selected chapters?`
      : bulkDeleteMode === 'topics'
        ? `Delete all topics inside ${selectedChapterIds.length} selected chapters?`
        : `Delete selected chapters and all their topics/questions (${selectedChapterIds.length} chapters)?`;

    if (!confirm(confirmMessage)) return;

    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };

    setBulkDeleteLoading(true);
    try {
      if (bulkDeleteMode === 'questions') {
        for (const ids of chunk(selectedChapterIds, 100)) {
          const { error } = await supabase.from('questions').delete().in('chapter_id', ids);
          if (error) throw error;
        }
      }

      if (bulkDeleteMode === 'topics') {
        let topicIds: string[] = [];
        for (const ids of chunk(selectedChapterIds, 100)) {
          const { data, error } = await supabase.from('topics').select('id').in('chapter_id', ids);
          if (error) throw error;
          topicIds = topicIds.concat((data || []).map((topic) => topic.id));
        }

        for (const ids of chunk(topicIds, 100)) {
          const { error: updateErr } = await supabase
            .from('questions')
            .update({ topic_id: null, topic: null } as any)
            .in('topic_id', ids);
          if (updateErr) throw updateErr;
        }

        for (const ids of chunk(selectedChapterIds, 100)) {
          const { error } = await supabase.from('topics').delete().in('chapter_id', ids);
          if (error) throw error;
        }
      }

      if (bulkDeleteMode === 'all') {
        for (const ids of chunk(selectedChapterIds, 100)) {
          const { error: deleteQuestionsErr } = await supabase.from('questions').delete().in('chapter_id', ids);
          if (deleteQuestionsErr) throw deleteQuestionsErr;

          const { error: deleteTopicsErr } = await supabase.from('topics').delete().in('chapter_id', ids);
          if (deleteTopicsErr) throw deleteTopicsErr;

          const { error: deleteChaptersErr } = await supabase.from('chapters').delete().in('id', ids);
          if (deleteChaptersErr) throw deleteChaptersErr;
        }
      }

      toast.success('Bulk delete completed successfully');
      setSelectedChapterIds([]);
      setIsBulkDeleteDialogOpen(false);
      fetchChapters();
    } catch (error: any) {
      logger.error('Bulk delete failed', error);
      toast.error(`Bulk delete failed: ${error?.message || 'Unknown error'}`);
    } finally {
      setBulkDeleteLoading(false);
    }
  }, [bulkDeleteMode, fetchChapters, selectedChapterIds]);

  const openMoveDialog = (chapter: Chapter) => {
    setMovingChapter(chapter);
    // Pre-fill with current location
    const currentBatch = batches.find(b => b.id === chapter.batch_id);
    setMoveTarget({
      exam: currentBatch?.exam_type || 'JEE',
      grade: currentBatch?.grade || 12,
      subject: chapter.subject
    });
    setIsMoveDialogOpen(true);
  };

  const handleMoveChapter = async () => {
    if (!movingChapter) return;

    // Find target batch
    const targetBatch = batches.find(b => 
      b.exam_type.toLowerCase() === moveTarget.exam.toLowerCase() && 
      b.grade === moveTarget.grade
    );

    if (!targetBatch) {
      toast.error(`No batch found for ${moveTarget.exam} Grade ${moveTarget.grade}`);
      return;
    }

    const { error } = await supabase
      .from('chapters')
      .update({ 
        batch_id: targetBatch.id,
        class_level: targetBatch.grade,
        subject: SUBJECT_CODE_BY_NAME[moveTarget.subject] || moveTarget.subject
      })
      .eq('id', movingChapter.id);

    if (error) {
      toast.error('Failed to move chapter');
      logger.error('Failed to move chapter', error);
      return;
    }

    const nextSubject = SUBJECT_CODE_BY_NAME[moveTarget.subject] || moveTarget.subject;
    const { error: questionSyncError } = await supabase
      .from('questions')
      .update({ batch_id: targetBatch.id, subject: nextSubject })
      .eq('chapter_id', movingChapter.id);

    if (questionSyncError) {
      toast.error('Chapter moved, but question sync failed');
      logger.error('Move chapter question sync failed', questionSyncError);
      return;
    }

    toast.success(`Moved "${movingChapter.chapter_name}" to ${moveTarget.exam} Grade ${moveTarget.grade} - ${moveTarget.subject}`);
    setIsMoveDialogOpen(false);
    setMovingChapter(null);
    fetchChapters();
  };

  const handleBulkMoveChapters = async () => {
    if (selectedChapterIds.length === 0) return;
    const targetBatch = batches.find(b =>
      b.exam_type.toLowerCase() === bulkMoveTarget.exam.toLowerCase() &&
      b.grade === bulkMoveTarget.grade
    );
    if (!targetBatch) {
      toast.error(`No batch for ${bulkMoveTarget.exam} Grade ${bulkMoveTarget.grade}`);
      return;
    }
    const nextSubject = SUBJECT_CODE_BY_NAME[bulkMoveTarget.subject] || bulkMoveTarget.subject;
    setBulkMoveLoading(true);
    const tId = toast.loading(`Moving ${selectedChapterIds.length} chapters…`);
    try {
      for (let i = 0; i < selectedChapterIds.length; i += 100) {
        const ids = selectedChapterIds.slice(i, i + 100);
        const { error: chErr } = await supabase
          .from('chapters')
          .update({ batch_id: targetBatch.id, class_level: targetBatch.grade, subject: nextSubject })
          .in('id', ids);
        if (chErr) throw chErr;
        const { error: qErr } = await supabase
          .from('questions')
          .update({ batch_id: targetBatch.id, subject: nextSubject })
          .in('chapter_id', ids);
        if (qErr) throw qErr;
      }
      toast.success(`Moved ${selectedChapterIds.length} chapters → ${bulkMoveTarget.exam} Grade ${bulkMoveTarget.grade} · ${bulkMoveTarget.subject}`, { id: tId });
      setIsBulkMoveDialogOpen(false);
      setSelectedChapterIds([]);
      fetchChapters();
    } catch (e: any) {
      toast.error(`Bulk move failed: ${e?.message || 'Unknown error'}`, { id: tId });
      logger.error('Bulk move failed', e);
    } finally {
      setBulkMoveLoading(false);
    }
  };

  // ─── Move Questions Between Chapters ─────────────────────────────────────
  const openMoveQuestionsDialog = async (chapter: Chapter) => {
    setMoveQuestionsSource(chapter);
    setMoveQuestionsTargetId('');
    setMovingQuestions(false);

    // Get question count for this chapter
    const { count } = await supabase
      .from('questions')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', chapter.id);
    setMoveQuestionsCount(count || 0);

    // Load all chapters across all batches for target selection. Include
    // legacy rows where is_active IS NULL (older imports without the flag).
    const { data: allChs } = await supabase
      .from('chapters')
      .select('id, chapter_name, subject, batch_id')
      .neq('id', chapter.id)
      .or('is_active.is.null,is_active.eq.true')
      .order('subject')
      .order('chapter_name');

    const mapped = (allChs || []).map(ch => ({
      id: ch.id,
      chapter_name: ch.chapter_name,
      subject: ch.subject,
      batch_name: getBatchName(ch.batch_id || ''),
    }));
    setAllChaptersForMove(mapped);
    setIsMoveQuestionsDialogOpen(true);
  };

  const handleMoveAllQuestions = async () => {
    if (!moveQuestionsSource || !moveQuestionsTargetId) return;
    setMovingQuestions(true);

    try {
      // Get target chapter info
      const targetCh = allChaptersForMove.find(c => c.id === moveQuestionsTargetId);
      
      // Find the batch_id for the target chapter
      const { data: targetChData } = await supabase
        .from('chapters')
        .select('id, batch_id, chapter_name, subject')
        .eq('id', moveQuestionsTargetId)
        .single();

      if (!targetChData) {
        toast.error('Target chapter not found');
        setMovingQuestions(false);
        return;
      }

      const { error } = await supabase
        .from('questions')
        .update({
          chapter_id: moveQuestionsTargetId,
          chapter: targetChData.chapter_name,
          batch_id: targetChData.batch_id,
          subject: targetChData.subject,
        })
        .eq('chapter_id', moveQuestionsSource.id);

      if (error) {
        toast.error('Failed to move questions: ' + error.message);
      } else {
        toast.success(`Moved ${moveQuestionsCount} questions to "${targetCh?.chapter_name}"`);
        setIsMoveQuestionsDialogOpen(false);
        fetchChapters();
      }
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setMovingQuestions(false);
    }
  };

  const openEditDialog = (chapter: Chapter) => {
    setEditingChapter(chapter);
    setFormData({
      chapter_name: chapter.chapter_name,
      chapter_number: chapter.chapter_number,
      description: chapter.description || '',
      is_free: chapter.is_free ?? true
    });
    setIsEditDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      chapter_name: '',
      chapter_number: 1,
      description: '',
      is_free: true
    });
  };

  // ─── Create / Edit ─────────────────────────────────────────────────────────
  const handleAddChapter = async () => {
    const batchId = getCurrentBatchId();
    if (batchId === 'NOT_FOUND') {
      toast.error('No batch found for this grade/exam. Create the batch first.');
      return;
    }
    if (!formData.chapter_name.trim()) {
      toast.error('Chapter name is required');
      return;
    }

    const dbSubject = SUBJECT_CODE_BY_NAME[selectedSubject] || selectedSubject;
    const targetBatch = batches.find(b => b.id === batchId);

    // Resolve subject_id FK so subject joins are populated (data integrity)
    let subjectId: string | null = null;
    const { data: subjRow } = await supabase
      .from('subjects')
      .select('id')
      .or(`name.ilike.${selectedSubject},code.ilike.${selectedSubject},name.ilike.${dbSubject},code.ilike.${dbSubject}`)
      .limit(1)
      .maybeSingle();
    if (subjRow?.id) subjectId = subjRow.id;

    const { error } = await supabase.from('chapters').insert({
      chapter_name: formData.chapter_name.trim(),
      name: formData.chapter_name.trim(),
      slug: slugifyChapterPart(formData.chapter_name),
      chapter_number: formData.chapter_number,
      subject: dbSubject,
      subject_id: subjectId,
      description: formData.description || null,
      is_free: formData.is_free,
      is_active: true,
      batch_id: batchId,
      class_level: targetBatch?.grade ?? gradeFilter,
    } as any);

    if (error) {
      toast.error(`Failed to add chapter: ${error.message}`);
      logger.error('Add chapter failed', error);
      return;
    }

    toast.success('Chapter added');
    setIsAddDialogOpen(false);
    resetForm();
    fetchChapters();
  };

  const handleEditChapter = async () => {
    if (!editingChapter) return;
    if (!formData.chapter_name.trim()) {
      toast.error('Chapter name is required');
      return;
    }

    const { error } = await supabase
      .from('chapters')
      .update({
        chapter_name: formData.chapter_name.trim(),
        name: formData.chapter_name.trim(),
        chapter_number: formData.chapter_number,
        description: formData.description || null,
        is_free: formData.is_free,
      } as any)
      .eq('id', editingChapter.id);

    if (error) {
      toast.error(`Failed to update chapter: ${error.message}`);
      logger.error('Edit chapter failed', error);
      return;
    }

    toast.success('Chapter updated');
    setIsEditDialogOpen(false);
    setEditingChapter(null);
    resetForm();
    fetchChapters();
  };

  // ─── Free/Premium toggle ───────────────────────────────────────────────────
  const toggleFreeStatus = useCallback(async (id: string, current: boolean | null) => {
    const next = !(current ?? true);
    // Optimistic UI
    setChapters(prev => prev.map(c => c.id === id ? { ...c, is_free: next } : c));
    const { error } = await supabase.from('chapters').update({ is_free: next }).eq('id', id);
    if (error) {
      toast.error('Failed to update access');
      setChapters(prev => prev.map(c => c.id === id ? { ...c, is_free: current } : c));
    }
  }, []);

  // ─── Quick grade move (only for 11/12) ─────────────────────────────────────
  const getQuickMoveLabel = useCallback(() => {
    if (gradeFilter === 11) return '→ Grade 12';
    if (gradeFilter === 12) return '→ Grade 11';
    return undefined;
  }, [gradeFilter]);

  const handleQuickMove = useCallback(async (chapter: Chapter) => {
    if (gradeFilter !== 11 && gradeFilter !== 12) return;
    const targetGrade = gradeFilter === 11 ? 12 : 11;
    const targetBatch = batches.find(b =>
      b.exam_type.toLowerCase() === examFilter.toLowerCase() &&
      b.grade === targetGrade
    );
    if (!targetBatch) {
      toast.error(`No ${examFilter} batch for Grade ${targetGrade}`);
      return;
    }

    const { error } = await supabase
      .from('chapters')
      .update({ batch_id: targetBatch.id, class_level: targetGrade })
      .eq('id', chapter.id);

    if (error) {
      toast.error('Quick move failed');
      logger.error('Quick move failed', error);
      return;
    }

    await supabase
      .from('questions')
      .update({ batch_id: targetBatch.id })
      .eq('chapter_id', chapter.id);

    toast.success(`Moved "${chapter.chapter_name}" to Grade ${targetGrade}`);
    fetchChapters();
  }, [gradeFilter, examFilter, batches, fetchChapters]);

  // ─── Drag & drop reordering ────────────────────────────────────────────────
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = chapters.findIndex(c => c.id === active.id);
    const newIndex = chapters.findIndex(c => c.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const reordered = arrayMove(chapters, oldIndex, newIndex).map((c, idx) => ({
      ...c,
      chapter_number: idx + 1,
    }));
    setChapters(reordered);

    // Persist new chapter_numbers
    try {
      await Promise.all(reordered.map(c =>
        supabase.from('chapters').update({ chapter_number: c.chapter_number }).eq('id', c.id)
      ));
    } catch (e) {
      logger.error('Reorder persist failed', e);
      toast.error('Failed to save new order');
      fetchChapters();
    }
  }, [chapters, fetchChapters]);


  return (
    <div className="space-y-6">
      {/* Compact filter bar */}
      <div className="rounded-2xl border border-primary/15 bg-linear-to-r from-primary/10 via-white to-slate-50 px-3.5 py-3 sm:px-4 sm:py-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="shrink-0 rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            Filters
          </div>

          <div className="h-5 w-px shrink-0 bg-border/80" />

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span className="shrink-0 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Grade
            </span>
            {[6, 7, 8, 9, 10, 11, 12].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGradeFilter(g)}
                className={[
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all duration-200',
                  gradeFilter === g
                    ? 'border-[#013062] bg-[#013062] text-white shadow-md shadow-[#013062]/20'
                    : 'border-[#013062]/15 bg-white text-[#013062] hover:border-[#013062]/35 hover:bg-[#013062]/5',
                ].join(' ')}
              >
                {g <= 10 ? `Class ${g}` : `Grade ${g}`}
              </button>
            ))}
          </div>

          {gradeFilter >= 11 && (
            <>
              <div className="h-5 w-px shrink-0 bg-border/80" />
              <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                <span className="shrink-0 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Exam
                </span>
                {(['JEE', 'NEET'] as const).map((exam) => (
                  <button
                    key={exam}
                    type="button"
                    onClick={() => setExamFilter(exam)}
                    className={[
                      'shrink-0 rounded-full border px-3.5 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all duration-200',
                      examFilter === exam
                        ? 'border-[#013062] bg-[#013062] text-white shadow-md shadow-[#013062]/20'
                        : 'border-[#013062]/15 bg-white text-[#013062] hover:border-[#013062]/35 hover:bg-[#013062]/5',
                    ].join(' ')}
                  >
                    {exam}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="h-5 w-px shrink-0 bg-border/80" />

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
            <span className="shrink-0 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              Subject
            </span>
            {validSubjects.map((subject) => (
              <button
                key={subject}
                type="button"
                onClick={() => toggleSubjectFilter(subject)}
                className={[
                  'shrink-0 rounded-full border px-3.5 py-1.5 text-xs sm:px-4 sm:py-2 sm:text-sm font-semibold transition-all duration-200',
                  selectedSubject === subject
                    ? 'border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20'
                    : 'border-border bg-white text-muted-foreground hover:border-primary/35 hover:text-foreground',
                ].join(' ')}
              >
                {subject}
              </button>
            ))}
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Chapter Management
              </CardTitle>
                <CardDescription>
                  Drag rows to reorder · numbers auto-update · use → arrows to move between grades
                </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/20 px-2 py-1">

                <Checkbox
                  checked={chapters.length > 0 && selectedChapterIds.length === chapters.length ? true : (selectedChapterIds.length > 0 ? 'indeterminate' : false)}
                  onCheckedChange={(checked) => toggleSelectAllChapters(checked === true)}
                  aria-label="Select all chapters"
                />
                <span className="text-xs text-muted-foreground">{selectedChapterIds.length} selected</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSelectAllChapters(true)}
                  disabled={chapters.length === 0 || selectedChapterIds.length === chapters.length}
                  className="h-7 px-2 text-xs"
                >
                  Select all
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleSelectAllChapters(false)}
                  disabled={selectedChapterIds.length === 0}
                  className="h-7 px-2 text-xs"
                >
                  Clear
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleOpenBulkDeleteDialog}
                  disabled={selectedChapterIds.length === 0}
                  className="h-7 px-2 text-xs"
                >
                  Delete Selected
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => setIsBulkMoveDialogOpen(true)}
                  disabled={selectedChapterIds.length === 0}
                  className="h-7 px-2 text-xs gap-1"
                  title="Move selected chapters to another course/grade/subject"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Move Selected
                </Button>
              </div>
              <Button
                variant="default"
                size="sm"
                onClick={handleOpenBulkDeleteDialog}
                disabled={selectedChapterIds.length === 0}
                className="gap-1"
                title="Delete selected chapters"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </Button>
              {gradeFilter >= 11 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (!confirm('This will auto-redistribute ALL 11th/12th chapters based on NCERT syllabus mapping. Continue?')) return;
                    toast.loading('Running NCERT auto-fix...');
                    const { data, error } = await supabase.rpc('fix_chapter_batch_distribution');
                    toast.dismiss();
                    if (error) { toast.error('Auto-fix failed: ' + error.message); return; }
                    const result = data as any;
                    toast.success(`Moved ${result?.total_questions_moved || 0} questions across ${result?.chapters_processed || 0} chapters`);
                    fetchChapters();
                  }}
                  className="gap-1"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Auto-Fix 11↔12
                </Button>
              )}
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={resetForm}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Chapter
                  </Button>
                </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add New Chapter</DialogTitle>
                  <DialogDescription>
                    Add a new chapter
                  </DialogDescription>
                </DialogHeader>
                <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-3">
                  <GraduationCap className="w-5 h-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium text-primary">
                      Adding to: {gradeFilter <= 10 ? `Foundation Class ${gradeFilter}` : `${examFilter} Grade ${gradeFilter}`}
                    </p>
                    <p className="text-xs text-muted-foreground">Subject follows the selected filter</p>
                  </div>
                </div>
                <div className="grid gap-4 py-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Chapter Number*</Label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.chapter_number}
                        onChange={(e) => setFormData({...formData, chapter_number: parseInt(e.target.value) || 1})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Access</Label>
                      <Select value={formData.is_free ? 'free' : 'premium'} onValueChange={(val) => setFormData({...formData, is_free: val === 'free'})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="free">Free</SelectItem>
                          <SelectItem value="premium">Premium</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Chapter Name*</Label>
                    <Input
                      value={formData.chapter_name}
                      onChange={(e) => setFormData({...formData, chapter_name: e.target.value})}
                      placeholder="e.g., Mechanics"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      placeholder="Brief description of the chapter"
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleAddChapter}>Add Chapter</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Chapters List with Drag-and-Drop */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={chapters.map(c => c.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {chapters.map((chapter) => (
                  <SortableChapterItem
                    key={chapter.id}
                    chapter={chapter}
                    getBatchName={getBatchName}
                    isSelected={selectedChapterIds.includes(chapter.id)}
                    onToggleSelected={toggleChapterSelection}
                    toggleFreeStatus={toggleFreeStatus}
                    openMoveDialog={openMoveDialog}
                    openEditDialog={openEditDialog}
                    handleDeleteChapter={handleDeleteChapter}
                    openMoveQuestionsDialog={openMoveQuestionsDialog}
                    quickMoveLabel={gradeFilter >= 11 ? getQuickMoveLabel() : undefined}
                    onQuickMove={gradeFilter >= 11 ? handleQuickMove : undefined}
                  />
                ))}
                {chapters.length === 0 && (
                  <div className="text-center py-10 text-muted-foreground">
                    No chapters found in this batch.
                  </div>
                )}
              </div>
            </SortableContext>

            {/* Ghost card shown while dragging */}
            <DragOverlay>
              {activeDragId ? (() => {
                const ch = chapters.find(c => c.id === activeDragId);
                if (!ch) return null;
                return (
                  <div className="flex items-center gap-3 p-3 border-2 border-primary rounded-lg bg-card shadow-2xl opacity-90">
                    <GripVertical className="w-5 h-5 text-primary shrink-0" />
                    <ChapterRowContent chapter={ch} getBatchName={getBatchName} isDragging={true} />
                  </div>
                );
              })() : null}
            </DragOverlay>
          </DndContext>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Chapter</DialogTitle>
            <DialogDescription>
              Update chapter details
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chapter Number*</Label>
                <Input
                  type="number"
                  min="1"
                  value={formData.chapter_number}
                  onChange={(e) => setFormData({...formData, chapter_number: parseInt(e.target.value) || 1})}
                />
              </div>
              <div className="space-y-2">
                <Label>Access</Label>
                <Select value={formData.is_free ? 'free' : 'premium'} onValueChange={(val) => setFormData({...formData, is_free: val === 'free'})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="premium">Premium</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Chapter Name*</Label>
              <Input
                value={formData.chapter_name}
                onChange={(e) => setFormData({...formData, chapter_name: e.target.value})}
                placeholder="e.g., Mechanics"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                placeholder="Brief description of the chapter"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditChapter}>Update Chapter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Chapter Dialog */}
      <Dialog open={isMoveDialogOpen} onOpenChange={setIsMoveDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Move Chapter</DialogTitle>
            <DialogDescription>
              Move "{movingChapter?.chapter_name}" to a different course, grade, or subject
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <strong>Current:</strong> {movingChapter?.subject} — {movingChapter?.batch_id ? getBatchName(movingChapter.batch_id) : 'Unknown'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Course</Label>
                <Select value={moveTarget.exam} onValueChange={(v) => setMoveTarget(prev => ({ ...prev, exam: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JEE">JEE</SelectItem>
                    <SelectItem value="NEET">NEET</SelectItem>
                    <SelectItem value="Foundation">Foundation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Grade</Label>
                <Select value={String(moveTarget.grade)} onValueChange={(v) => setMoveTarget(prev => ({ ...prev, grade: parseInt(v) }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {moveTarget.exam === 'Foundation' 
                      ? [6, 7, 8, 9, 10].map(g => (
                          <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                        ))
                      : [11, 12].map(g => (
                          <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                        ))
                    }
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Target Subject</Label>
              <Select value={moveTarget.subject} onValueChange={(v) => setMoveTarget(prev => ({ ...prev, subject: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(PROGRAM_SUBJECTS[normalizeProgram(moveTarget.exam)] || PROGRAM_SUBJECTS['Class']).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
              <p className="text-sm text-primary">
                <strong>Moving to:</strong> {moveTarget.subject} — {moveTarget.exam} Grade {moveTarget.grade}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMoveChapter}>Move Chapter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Move Chapters Dialog */}
      <Dialog open={isBulkMoveDialogOpen} onOpenChange={setIsBulkMoveDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5" />
              Bulk Move {selectedChapterIds.length} Chapter{selectedChapterIds.length === 1 ? '' : 's'}
            </DialogTitle>
            <DialogDescription>
              Move all selected chapters (and their questions) to a new course / grade / subject.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Target Course</Label>
                <Select value={bulkMoveTarget.exam} onValueChange={(v) => setBulkMoveTarget(p => ({ ...p, exam: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="JEE">JEE</SelectItem>
                    <SelectItem value="NEET">NEET</SelectItem>
                    <SelectItem value="Foundation">Foundation</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target Grade</Label>
                <Select value={String(bulkMoveTarget.grade)} onValueChange={(v) => setBulkMoveTarget(p => ({ ...p, grade: parseInt(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(bulkMoveTarget.exam === 'Foundation' ? [6,7,8,9,10] : [11,12]).map(g => (
                      <SelectItem key={g} value={String(g)}>Grade {g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Target Subject</Label>
              <Select value={bulkMoveTarget.subject} onValueChange={(v) => setBulkMoveTarget(p => ({ ...p, subject: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(PROGRAM_SUBJECTS[normalizeProgram(bulkMoveTarget.exam)] || PROGRAM_SUBJECTS['Class']).map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm text-primary">
              <strong>{selectedChapterIds.length}</strong> chapter(s) + all their questions → {bulkMoveTarget.subject} · {bulkMoveTarget.exam} Grade {bulkMoveTarget.grade}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkMoveDialogOpen(false)} disabled={bulkMoveLoading}>Cancel</Button>
            <Button onClick={handleBulkMoveChapters} disabled={bulkMoveLoading}>
              {bulkMoveLoading && <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />}
              Move {selectedChapterIds.length}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Questions Dialog */}
      <Dialog open={isMoveQuestionsDialogOpen} onOpenChange={setIsMoveQuestionsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MoveRight className="w-5 h-5" />
              Move Questions
            </DialogTitle>
            <DialogDescription>
              Move all {moveQuestionsCount} questions from "{moveQuestionsSource?.chapter_name}" to another chapter
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Source: {moveQuestionsSource?.chapter_name} ({moveQuestionsCount} questions)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Target Chapter</Label>
              <Select value={moveQuestionsTargetId} onValueChange={setMoveQuestionsTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target chapter..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {allChaptersForMove.map(ch => (
                    <SelectItem key={ch.id} value={ch.id}>
                      {ch.chapter_name} — {ch.subject} ({ch.batch_name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {moveQuestionsTargetId && (
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-3">
                <p className="text-sm text-primary">
                  Will move <strong>{moveQuestionsCount}</strong> questions to{' '}
                  <strong>{allChaptersForMove.find(c => c.id === moveQuestionsTargetId)?.chapter_name}</strong>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMoveQuestionsDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleMoveAllQuestions}
              disabled={!moveQuestionsTargetId || movingQuestions || moveQuestionsCount === 0}
              className="gap-2"
            >
              {movingQuestions ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Moving...</>
              ) : (
                <><MoveRight className="w-4 h-4" /> Move All Questions</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isBulkDeleteDialogOpen} onOpenChange={setIsBulkDeleteDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Delete Content</DialogTitle>
            <DialogDescription>
              Delete content for {selectedChapterIds.length} selected chapters. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
              Selected chapters: <strong>{selectedChapterIds.length}</strong> · Topics: <strong>{bulkDeleteStats.topics}</strong> · Questions: <strong>{bulkDeleteStats.questions}</strong>
            </div>

            <div className="space-y-2">
              <Label>Delete Mode</Label>
              <Select value={bulkDeleteMode} onValueChange={(value: 'questions' | 'topics' | 'all') => setBulkDeleteMode(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="questions">Delete questions only (chapters stay)</SelectItem>
                  <SelectItem value="topics">Delete topics only (chapters stay)</SelectItem>
                  <SelectItem value="all">Delete chapters + topics + questions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
              {bulkDeleteMode === 'questions' && 'Deletes all questions under selected chapters.'}
              {bulkDeleteMode === 'topics' && 'Deletes all topics under selected chapters and unlinks topic references from related questions.'}
              {bulkDeleteMode === 'all' && 'Deletes questions first, then topics, then selected chapters to maintain database integrity.'}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkDeleteDialogOpen(false)} disabled={bulkDeleteLoading}>Cancel</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleteLoading || selectedChapterIds.length === 0}>
              {bulkDeleteLoading ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Deleting...</span>
              ) : (
                'Confirm Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChapterManager;