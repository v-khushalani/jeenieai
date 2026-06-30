import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  BookOpen, ChevronRight, ArrowLeft, Beaker, Calculator, Atom, Leaf,
  Play, Target, Sparkles,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import Header from '@/components/Header';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { logger } from '@/utils/logger';
import { getSubjects, normalizeTargetExam } from '@/config/goalConfig';
import { getSubjectAliases, normalizeSubject } from '@/lib/subjectNormalization';
import { fetchAllPaginated } from '@/utils/supabasePagination';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import StudyNotesPanel from '@/components/study/StudyNotesPanel';

interface Chapter {
  id: string;
  chapter_name: string;
  name?: string;
  subject: string;
  description?: string;
  question_count?: number;
  class_level?: number;
  
}

interface Topic {
  id: string;
  topic_name: string;
  description?: string;
  difficulty_level?: string;
  question_count?: number;
}

interface QuestionRow {
  id: string;
  chapter_id: string | null;
  chapter: string | null;
  topic_id: string | null;
  topic: string | null;
  exam: string | null;
  year: number | null;
  difficulty: string | null;
  subject: string | null;
}

const SUBJECT_META: Record<string, { icon: React.ReactNode; gradient: string; border: string; bg: string }> = {
  Physics: { icon: <Atom className="w-6 h-6 sm:w-8 sm:h-8 text-white" />, gradient: 'from-blue-500 to-cyan-500', border: 'border-blue-200 hover:border-blue-400', bg: 'bg-blue-100' },
  Chemistry: { icon: <Beaker className="w-6 h-6 sm:w-8 sm:h-8 text-white" />, gradient: 'from-green-500 to-emerald-500', border: 'border-green-200 hover:border-green-400', bg: 'bg-green-100' },
  Mathematics: { icon: <Calculator className="w-6 h-6 sm:w-8 sm:h-8 text-white" />, gradient: 'from-purple-500 to-indigo-500', border: 'border-purple-200 hover:border-purple-400', bg: 'bg-purple-100' },
  Biology: { icon: <Leaf className="w-6 h-6 sm:w-8 sm:h-8 text-white" />, gradient: 'from-amber-500 to-orange-500', border: 'border-amber-200 hover:border-amber-400', bg: 'bg-amber-100' },
};

type DrillLevel = 'subjects' | 'chapters' | 'topics';

const StudyNowPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [level, setLevel] = useState<DrillLevel>('subjects');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [userBatchIds, setUserBatchIds] = useState<string[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [subjectQuestionCounts, setSubjectQuestionCounts] = useState<Record<string, number>>({});
  const [subjectChapterCounts, setSubjectChapterCounts] = useState<Record<string, number>>({});
  const [userGrade, setUserGrade] = useState<number | null>(null);
  const [userExam, setUserExam] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const studyNotesEnabled = useFeatureFlag('study_notes');
  const [chaptersWithNotes, setChaptersWithNotes] = useState<Set<string>>(new Set());
  const [theoryChapter, setTheoryChapter] = useState<Chapter | null>(null);

  useEffect(() => {
    if (!studyNotesEnabled || chapters.length === 0) {
      setChaptersWithNotes(new Set());
      return;
    }
    const ids = chapters.map((c) => c.id).filter(Boolean);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      const [{ data: notes }, { data: maps }] = await Promise.all([
        supabase
          .from('study_notes')
          .select('chapter_id')
          .eq('is_published', true)
          .in('chapter_id', ids),
        supabase
          .from('concept_maps')
          .select('chapter_id')
          .eq('is_published', true)
          .in('chapter_id', ids),
      ]);
      if (cancelled) return;
      setChaptersWithNotes(new Set([...(notes || []), ...(maps || [])].map((r: any) => r.chapter_id).filter(Boolean)));
    })();
    return () => { cancelled = true; };
  }, [chapters, studyNotesEnabled]);


  const buildChapterOrFilter = (chapterName: string) => {
    const clean = (value: string) => value.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const base = clean(chapterName || '');
    if (!base) return '';
    const stripped = clean(
      base.replace(/^\s*(ch(?:apter)?)[\s\-.:]*([0-9]+|[ivxlcdm]+)[).:\s-]+/i, '')
        .replace(/^\s*([0-9]+|[ivxlcdm]+)[).:\s-]+/i, '')
    );
    const patterns = Array.from(new Set([base, stripped].filter(Boolean)));
    return patterns.map((pattern) => `chapter.ilike.%${pattern}%`).join(',');
  };

  const getChapterTitle = (chapter: Chapter | null) => chapter?.chapter_name || chapter?.name || 'Chapter';
  const getChapterQueryTitle = (chapter: Chapter | null) => chapter?.chapter_name || chapter?.name || '';
  const normalizeText = (value: string) => (value || '').trim().toLowerCase();
  const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  const getExamFilter = (exam?: string | null, grade?: number | null) => {
    if (!exam) return null;
    if (exam.toLowerCase().includes('neet')) return 'NEET';
    if (exam.toLowerCase().includes('jee')) return 'JEE';
    if (grade && grade <= 10) return 'Foundation';
    return exam;
  };
  const applyBatchScope = useCallback(<T,>(query: T): T => {
    if (userBatchIds.length === 0) return query;
    const ids = userBatchIds.join(',');
    return (query as any).or(`batch_id.in.(${ids}),batch_id.is.null`);
  }, [userBatchIds]);

  // Load chapters for a subject using the active batch scope first.
  const loadChapterRowsForSubject = useCallback(async (subject: string, global = false): Promise<Chapter[]> => {
    let query = supabase
      .from('chapters')
      .select('id, chapter_name, name, subject, description, class_level, batch_id, chapter_number')
      .in('subject', getSubjectAliases(subject))
      .eq('is_active', true)
      .order('chapter_number', { ascending: true });

    if (userBatchIds.length > 0) {
      query = query.in('batch_id', userBatchIds);
    } else if (userGrade) {
      query = query.eq('class_level', userGrade);
    }

    const { data, error } = await query;
    if (error) throw error;

    return (data || []) as Chapter[];
  }, [userBatchIds, userGrade]);

  // Server-side accurate count by chapter_id via RPC (single query, no pagination).
  const fetchChapterCountsForRows = useCallback(async (chapterRows: Chapter[]): Promise<Map<string, number>> => {
    const m = new Map<string, number>();
    const chapterIds = chapterRows.map((c) => c.id).filter(Boolean);
    if (chapterIds.length === 0) return m;

    const examFilter = getExamFilter(userExam, userGrade);
    try {
      const { data, error } = await supabase.rpc('get_chapter_question_counts', {
        p_chapter_ids: chapterIds,
        p_exam: examFilter,
      });
      if (error) throw error;
      (data || []).forEach((row: any) => {
        if (row?.chapter_id) m.set(row.chapter_id, Number(row.count) || 0);
      });
    } catch (error) {
      logger.error('Error fetching chapter question counts via RPC', error);
    }
    return m;
  }, [userExam, userGrade]);

  // Convenience wrapper that fetches rows + counts together (used when only subject is known).
  const fetchChaptersWithCounts = useCallback(async (subject: string): Promise<{ rows: Chapter[]; counts: Map<string, number> }> => {
    const rows = await loadChapterRowsForSubject(subject, false);
    const counts = await fetchChapterCountsForRows(rows);
    return { rows, counts };
  }, [loadChapterRowsForSubject, fetchChapterCountsForRows]);

  const summarizeChapterCounts = useCallback((chapterRows: Chapter[], chapterCounts: Map<string, number>) => {
    const deduped = new Map<string, Chapter>();
    const countByTitle = new Map<string, number>();

    chapterRows.forEach((chapter) => {
      const title = getChapterTitle(chapter);
      const key = normalizeText(title);
      if (!key) return;
      const count = chapterCounts.get(chapter.id) ?? 0;
      countByTitle.set(key, (countByTitle.get(key) || 0) + count);
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, { ...chapter, chapter_name: title } as Chapter);
        return;
      }
      if (!existing.description && chapter.description) {
        existing.description = chapter.description;
      }
    });

    const chapterList = Array.from(deduped.values()).map((chapter) => ({
      ...chapter,
      question_count: countByTitle.get(normalizeText(getChapterTitle(chapter))) || 0,
    }));

    const totalQuestionCount = chapterList.reduce((sum, chapter) => sum + (chapter.question_count || 0), 0);

    return { chapterList, totalQuestionCount };
  }, []);






  useEffect(() => {
    const loadUserContext = async () => {
      if (!user?.id) { setProfileLoading(false); return; }
      let targetExam: ReturnType<typeof normalizeTargetExam> | null = null;
      try {
        const { data: profile } = await supabase.from('profiles').select('grade, target_exam').eq('id', user.id).single();
        const grade = profile?.grade;
        targetExam = normalizeTargetExam(profile?.target_exam);
        setUserGrade(grade || null);
        setUserExam(targetExam || null);

        let batchQuery = supabase.from('batches').select('id').eq('is_active', true);
        if (grade) batchQuery = batchQuery.eq('grade', grade);
        if (targetExam) batchQuery = batchQuery.ilike('exam_type', `%${targetExam}%`);

        const { data: batches } = await batchQuery;
        const batchIds = (batches || []).map(b => b.id);
        setUserBatchIds(batchIds);

        let subjects: string[] = [];
        const chapterBase = () => supabase
          .from('chapters')
          .select('subject')
          .eq('is_active', true);

        if (batchIds.length > 0) {
          const { data: batchSubjects } = await supabase
            .from('batch_subjects')
            .select('subject')
            .in('batch_id', batchIds);
          subjects = [...new Set((batchSubjects || []).map(bs => bs.subject).filter(Boolean))];
        }

        if (subjects.length === 0) {
          let chapterQuery = chapterBase();
          if (batchIds.length > 0) chapterQuery = chapterQuery.in('batch_id', batchIds);
          if (grade) chapterQuery = chapterQuery.eq('class_level', grade);
          const { data: chapterSubjects } = await chapterQuery;
          subjects = [...new Set((chapterSubjects || []).map(c => c.subject).filter(Boolean))];
        }

        if (subjects.length === 0 && grade) {
          const { data: chapterSubjects } = await chapterBase().eq('class_level', grade);
          subjects = [...new Set((chapterSubjects || []).map(c => c.subject).filter(Boolean))];
        }

        const baselineSubjects = getSubjects(targetExam);
        const allowed = new Set(baselineSubjects.map((subject) => subject.toLowerCase()));

        // Merge DB-discovered subjects with the canonical baseline subjects for
        // the target exam. This ensures subjects like Chemistry and Mathematics
        // are shown even if the DB returned only a subset (e.g. Physics).
        const canonicalDbSubjects = subjects.map((s) => normalizeSubject(String(s || ''))).filter(Boolean);
        const merged = Array.from(new Set([...baselineSubjects, ...canonicalDbSubjects]));
        let finalSubjects = merged.filter((subject) => allowed.has(String(subject || '').toLowerCase()));
        if (finalSubjects.length === 0) finalSubjects = baselineSubjects;
        setAvailableSubjects(finalSubjects);
      } catch {
        setAvailableSubjects(getSubjects(targetExam));
      } finally {
        setProfileLoading(false);
      }
    };
    loadUserContext();
  }, [user?.id]);

  // Subject totals: prefer server-side subject aggregation (handles
  // questions without chapter_id). Fall back to summing chapter counts
  // for a subject if RPC data is not available.
  useEffect(() => {
    const fetchSubjectTotals = async () => {
      if (availableSubjects.length === 0) return;
      try {
        const map: Record<string, number> = {};

        await Promise.all(availableSubjects.map(async (subject) => {
          // Fetch chapter rows ONCE per subject, then count via RPC (no duplicate query).
          const scopedChapterRows = await loadChapterRowsForSubject(subject, false);
          const chapterCounts = await fetchChapterCountsForRows(scopedChapterRows);
          const chapterCount = (scopedChapterRows || []).length;

          const key = String(subject || '').trim().toUpperCase();

          const questionCount = (scopedChapterRows || []).reduce((sum, ch) => sum + (chapterCounts.get(ch.id) || 0), 0);
          map[key] = questionCount;
          setSubjectChapterCounts((prev) => ({ ...prev, [key]: chapterCount }));
        }));

        const filtered = Object.fromEntries(Object.entries(map).filter(([, count]) => count > 0));
        setSubjectQuestionCounts(filtered);

        const filteredSubjects = availableSubjects.filter((subject) => (filtered[String(subject || '').trim().toUpperCase()] ?? 0) > 0);
        if (filteredSubjects.length > 0 && filteredSubjects.length !== availableSubjects.length) {
          setAvailableSubjects(filteredSubjects);
        }
      } catch (err) {
        logger.error('Error fetching subject totals:', err);
        setSubjectQuestionCounts({});
        setSubjectChapterCounts({});
      }
    };

    fetchSubjectTotals();
  }, [availableSubjects, fetchChapterCountsForRows, loadChapterRowsForSubject, summarizeChapterCounts, userBatchIds, userExam, userGrade]);

  const fetchChapters = async (subject: string) => {
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    let nextChapters: Chapter[] | null = null;
    try {
      // Fetch chapter rows ONCE, then count via RPC — was doing chapter query twice.
      const chapterRows = await loadChapterRowsForSubject(subject);
      const chapterCounts = await fetchChapterCountsForRows(chapterRows);
      const { chapterList } = summarizeChapterCounts(chapterRows, chapterCounts);
      nextChapters = chapterList;

    } catch {
      toast.error('Failed to load chapters');
    } finally {
      if (requestId === requestSeqRef.current) {
        if (nextChapters) setChapters(nextChapters);
        setLoading(false);
      }
    }
  };

  const fetchTopics = async (chapter: Chapter) => {
    const requestId = ++requestSeqRef.current;
    setLoading(true);
    let nextTopics: Topic[] | null = null;
    try {
      const examFilter = getExamFilter(userExam, userGrade);
      const [topicRowsRes, topicCountsRes] = await Promise.all([
        supabase
          .from('topics')
          .select('id, topic_name, name, description, difficulty_level')
          .eq('chapter_id', chapter.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true, nullsFirst: false })
          .order('topic_number', { ascending: true, nullsFirst: false }),
        supabase.rpc('get_topic_question_counts', {
          p_chapter_id: chapter.id,
          p_batch_ids: userBatchIds.length > 0 ? userBatchIds : null,
          p_exam: examFilter,
        }),
      ]);
      if (topicRowsRes.error) throw topicRowsRes.error;

      const countByTopicId = new Map<string, number>();

      // Prefer server RPC results, but fall back to direct question scan when
      // the RPC fails or returns no data (keeps UI consistent).
      if (!topicCountsRes.error && topicCountsRes.data && Array.isArray(topicCountsRes.data) && topicCountsRes.data.length > 0) {
        (topicCountsRes.data || []).forEach((r: any) => countByTopicId.set(r.topic_id, Number(r.count) || 0));
      } else {
        // Fallback: fetch active questions for this chapter and count by topic_id
        try {
          const { data: qRows, error: qErr } = await supabase
            .from('questions')
            .select('id, topic_id')
            .eq('chapter_id', chapter.id)
            .eq('is_active', true);
          if (!qErr && qRows) {
            (qRows || []).forEach((q: any) => {
              const t = q.topic_id;
              if (!t) return;
              countByTopicId.set(t, (countByTopicId.get(t) || 0) + 1);
            });
          }
        } catch (e) {
          // If fallback also fails, continue with zero counts so UI doesn't crash
          logger.error('Topic counts fallback failed', e);
        }
      }

      const topicList: Topic[] = (topicRowsRes.data || []).map((t: any) => {
        const name = (t.topic_name || t.name || '').trim();
        return {
          id: t.id,
          topic_name: name || 'Topic',
          description: t.description || undefined,
          difficulty_level: t.difficulty_level || undefined,
          question_count: countByTopicId.get(t.id) ?? 0,
        };
      });

      nextTopics = topicList;

      // Sync chapter total with the sum of topic question counts so the
      // "Practice Full Chapter" badge matches what's actually available.
      const topicSum = topicList.reduce((s, t) => s + (t.question_count || 0), 0);
      if (topicSum > 0) {
        setSelectedChapter((prev) =>
          prev && prev.id === chapter.id ? { ...prev, question_count: Math.max(prev.question_count || 0, topicSum) } : prev,
        );
      }
    } catch {
      toast.error('Failed to load topics');
    } finally {
      if (requestId === requestSeqRef.current) {
        if (nextTopics) setTopics(nextTopics);
        setLoading(false);
      }
    }

  };

  const handleSubjectClick = (subject: string) => { setSelectedSubject(subject); setLevel('chapters'); setChapters([]); setTopics([]); fetchChapters(subject); };
  const handleChapterClick = (chapter: Chapter) => { setSelectedChapter(chapter); setLevel('topics'); setTopics([]); fetchTopics(chapter); };
  const handleTopicClick = (topic: Topic) => {
    const baseUrl = `/practice?subject=${encodeURIComponent(selectedSubject)}&chapter=${encodeURIComponent(getChapterTitle(selectedChapter))}`;
    const topicIdParam = isUuid(topic.id) ? `&topic_id=${topic.id}` : '';
    navigate(`${baseUrl}${topicIdParam}&topic=${encodeURIComponent(topic.topic_name)}&source=studyNow`);
  };
  const handlePracticeChapter = (chapter: Chapter) => {
    navigate(`/practice?subject=${encodeURIComponent(selectedSubject)}&chapter=${encodeURIComponent(getChapterTitle(chapter))}&chapter_id=${chapter.id}&source=studyNow`);
  };
  const handleTheoryClick = (event: React.SyntheticEvent, chapter: Chapter) => {
    event.preventDefault();
    event.stopPropagation();
    setTheoryChapter(chapter);
  };

  useEffect(() => {
    if (profileLoading) return;
    const chapterId = searchParams.get('chapter_id');
    const subject = searchParams.get('subject') || '';
    const chapterTitle = searchParams.get('chapter') || '';
    const mode = searchParams.get('mode') || 'learn';
    if (!chapterId || !subject || !chapterTitle) return;

    const chapter: Chapter = {
      id: chapterId,
      subject,
      chapter_name: chapterTitle,
    };

    setSelectedSubject(subject);
    setSelectedChapter(chapter);
    setLevel('topics');

    if (mode === 'learn' || mode === 'drill' || mode === 'review') {
      navigate(
        `/practice?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapterTitle)}&chapter_id=${chapterId}&source=planner&mode=${mode}`,
        { replace: true },
      );
      return;
    }

    void fetchTopics(chapter);
    // Run only for the current deep link; fetchTopics is intentionally excluded
    // to avoid re-triggering after its internal state updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileLoading, searchParams, navigate]);

  const goBack = () => {
    if (level === 'topics') { setLevel('chapters'); setSelectedChapter(null); setTopics([]); }
    else if (level === 'chapters') { setLevel('subjects'); setSelectedSubject(''); setChapters([]); }
  };




  const isLoading = profileLoading || loading;
  const subjectGridColumns = availableSubjects.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 xl:grid-cols-3';
  const loadingMessage = level === 'chapters'
    ? 'Loading chapters...'
    : level === 'topics'
      ? 'Loading topics...'
      : 'Loading study subjects...';

  if (isLoading) {
    return <LoadingScreen pageName="Study Now" message={loadingMessage} />;
  }

  return (
    <div className="mobile-app-shell bg-background">
      <Header />
      <div className="mobile-app-shell-content-fit relative z-10">
        <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-7xl h-[calc(100dvh-var(--app-header-height)-var(--app-mobile-nav-height))] py-2 sm:py-3 flex flex-col min-h-0">

          {/* Navigation */}
          {level !== 'subjects' && (
            <div className="mb-2 sm:mb-4 shrink-0">
              <Button variant="outline" className="border-2 border-primary text-sm" onClick={goBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                {level === 'chapters' ? 'Back to Subjects' : 'Back to Chapters'}
              </Button>
            </div>
          )}

          {/* SUBJECTS VIEW */}
          {level === 'subjects' && (
            <>
              {isLoading ? (
                <LoadingScreen pageName="Study Now" message="Loading study subjects..." />
              ) : (
                <div className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto sm:overflow-y-auto pb-4 sm:pb-6">
                  <div className={`grid grid-cols-1 ${subjectGridColumns} gap-3 sm:gap-5 w-full max-w-6xl py-2 sm:py-6 md:py-8 content-center place-content-center`}>
                    {availableSubjects.map((subName) => {
                      const subjectQuestionCount = subjectQuestionCounts[String(subName || '').trim().toUpperCase()] ?? 0;
                      const meta = SUBJECT_META[subName] || { icon: <BookOpen className="w-6 h-6 sm:w-8 sm:h-8 text-white" />, gradient: 'from-slate-500 to-slate-600', border: 'border-slate-200 hover:border-slate-400', bg: 'bg-slate-100' };
                      return (
                        <div key={subName} className="w-full overflow-visible">
                          <div className={`group relative rounded-3xl bg-card/95 border-2 border-l-4 border-l-[#e6eeff] ${meta.border} cursor-pointer shadow-lg sm:shadow-xl transition-all duration-300 sm:hover:shadow-2xl min-h-32 sm:min-h-54 flex flex-col box-border origin-center sm:hover:scale-[1.03]`} onClick={() => handleSubjectClick(subName)}>
                            <div className="p-3 sm:p-6 text-center h-full flex flex-col justify-between gap-2 sm:gap-4">
                              <div>
                                <div className={`w-10 h-10 sm:w-16 sm:h-16 bg-linear-to-br ${meta.gradient} rounded-2xl flex items-center justify-center mx-auto mb-2.5 sm:mb-4 transition-all duration-300 shadow-lg sm:shadow-xl sm:group-hover:scale-110 sm:group-hover:-translate-y-1`}>
                                  {meta.icon}
                                </div>
                                <h3 className="text-[13px] sm:text-2xl font-extrabold mb-0.5 sm:mb-2 text-foreground line-clamp-2 tracking-tight">{subName}</h3>
                              </div>

                              <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
                                <Badge variant="secondary" className="text-[10px] sm:text-xs font-semibold bg-primary/10 text-primary border-primary/20">
                                  {subjectQuestionCount} Questions
                                </Badge>
                                <Badge variant="outline" className="text-[10px] sm:text-xs font-semibold">
                                  {(subjectChapterCounts[String(subName || '').trim().toUpperCase()] ?? 0)} Chapters
                                </Badge>
                              </div>

                              <Button className="w-full bg-linear-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold py-3 rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 text-base mt-1 sm:mt-0">
                                <Sparkles className="w-3 h-3 sm:w-4 sm:h-4 mr-1 sm:mr-2" />
                                <span>Start Practicing</span>
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* CHAPTERS VIEW */}
          {level === 'chapters' && (
            <Card className="border-2 border-primary/20 shadow-lg bg-card overflow-hidden flex-1 min-h-0 flex flex-col">
              <CardContent className="p-3 sm:p-5 min-h-0 flex-1 flex flex-col">
                <div className="mb-3 sm:mb-4 rounded-2xl border border-primary/15 bg-linear-to-r from-primary/10 via-white to-blue-50 p-3 sm:p-4 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-linear-to-br ${SUBJECT_META[selectedSubject]?.gradient || 'from-primary to-blue-600'} flex items-center justify-center shrink-0 shadow-md`}>
                      {SUBJECT_META[selectedSubject]?.icon || <BookOpen className="w-4 h-4 sm:w-5 sm:h-5 text-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] sm:text-xs text-muted-foreground font-semibold">Selected Subject</p>
                      <h2 className="text-base sm:text-2xl font-extrabold text-foreground truncate">{selectedSubject}</h2>
                    </div>
                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px] sm:text-xs font-semibold">
                      {chapters.length} Chapters
                    </Badge>
                  </div>
                </div>
                {isLoading ? (
                  <LoadingScreen pageName="Study Now" message="Loading chapters..." />
                ) : chapters.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">No chapters found for {selectedSubject}.</div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 min-h-0 overflow-y-auto pr-1 sm:pr-2">
                    {chapters.map((ch, i) => (
                      <div key={ch.id} className="p-3 sm:p-4 border-2 rounded-2xl cursor-pointer transition-all duration-200 border-border bg-card hover:border-primary/50 hover:shadow-md hover:bg-card/90" onClick={() => handleChapterClick(ch)}>
                        <div className="flex items-center space-x-3 sm:space-x-4">
                          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-linear-to-br from-primary to-blue-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm shrink-0 shadow-xs">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-foreground text-sm sm:text-base truncate">{getChapterTitle(ch)}</div>
                            {ch.description && <div className="text-xs text-muted-foreground truncate mt-0.5">{ch.description}</div>}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {studyNotesEnabled && chaptersWithNotes.has(ch.id) && (
                              <Badge
                                variant="secondary"
                                role="button"
                                tabIndex={0}
                                onClick={(event) => handleTheoryClick(event, ch)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') handleTheoryClick(event, ch);
                                }}
                                className="text-[10px] sm:text-xs gap-1 cursor-pointer hover:bg-primary/15 hover:text-primary transition-colors"
                                title="Open theory, notes and concept map"
                              >
                                <Sparkles className="w-3 h-3" /> Theory
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] sm:text-xs">{ch.question_count || 0} Qs</Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Dialog open={!!theoryChapter} onOpenChange={(open) => !open && setTheoryChapter(null)}>
            <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{theoryChapter ? getChapterTitle(theoryChapter) : 'Theory'}</DialogTitle>
              </DialogHeader>
              {theoryChapter && (
                <StudyNotesPanel key={theoryChapter.id} chapterId={theoryChapter.id} forcePreview />
              )}
            </DialogContent>
          </Dialog>

          {/* TOPICS VIEW */}
          {level === 'topics' && (
            <Card className="border-2 border-purple-200 shadow-lg bg-card overflow-hidden flex-1 min-h-0 flex flex-col">
              <CardContent className="p-3 sm:p-6 min-h-0 flex-1 flex flex-col">
                {isLoading ? (
                  <LoadingScreen pageName="Study Now" message="Loading topics..." />
                ) : (
                  <div className="space-y-3 min-h-0 flex flex-col">
                    {selectedChapter && (
                      <div className="p-3 sm:p-6 rounded-2xl bg-linear-to-r from-primary/10 via-white to-purple-50 dark:to-purple-950/20 border-2 border-primary/20 shadow-md shrink-0">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Target className="w-4 h-4 text-primary" />
                              <p className="font-bold text-lg sm:text-xl text-foreground">Practice Full Chapter</p>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <p className="text-xs sm:text-sm text-muted-foreground">All questions from {getChapterTitle(selectedChapter)}</p>
                              <Badge variant="outline" className="text-[10px] sm:text-xs">
                                {selectedChapter.question_count || 0} Qs
                              </Badge>
                            </div>
                          </div>
                          <Button className="w-full sm:w-auto bg-linear-to-r from-primary to-blue-600 hover:from-primary/90 hover:to-blue-600/90 text-white font-semibold rounded-xl shadow-md" onClick={() => handlePracticeChapter(selectedChapter)}>
                            <Play className="w-4 h-4 mr-2" />
                            Start Practice
                          </Button>
                        </div>
                      </div>
                    )}

                    {topics.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        Topics are not available for this chapter yet. Use the full chapter practice above.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-h-0 overflow-y-auto pr-1 sm:pr-2">
                        {topics.map(topic => (
                          <div key={topic.id} className="p-3 sm:p-4 border-2 rounded-2xl cursor-pointer transition-all duration-200 hover:scale-[1.01] border-border bg-card hover:border-purple-400 hover:shadow-md" onClick={() => handleTopicClick(topic)}>
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-xl bg-linear-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-xs">
                                <Target className="w-4 h-4 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-foreground text-sm truncate">{topic.topic_name}</div>
                                {topic.description && <div className="text-xs text-muted-foreground truncate">{topic.description}</div>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <Badge variant="outline" className="text-[10px]">{topic.question_count || 0} Qs</Badge>
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>

                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default StudyNowPage;
