import { normalizeProgram, PROGRAM_SUBJECTS } from '@/utils/programConfig';
import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  CheckCircle2, XCircle, Edit2, Loader2, ChevronLeft, ChevronRight, 
  RefreshCw, FileText, BookOpen, AlertTriangle, Copy, SkipForward, 
  Replace, Sparkles, Filter, Database, Undo2, ImageOff, Eye
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { MathDisplay } from "./MathDisplay";
import { logger } from "@/utils/logger";
import { bulkAutoAssign, clearCurriculumCache } from "@/services/topicAssignmentService";
import { quickTextSimilarity } from "@/services/nlp";

interface ExtractedQuestion {
  id: string;
  source_file: string;
  page_number: number;
  parsed_question: {
    question_number?: string;
    question: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: string;
    explanation?: string;
    subject: string;
    chapter?: string;
    topic?: string;
    difficulty?: string;
    exam?: string;
    auto_assigned_chapter_id?: string;
    auto_assigned_topic_id?: string;
    auto_assigned_chapter_name?: string;
    auto_assigned_topic_name?: string;
    confidence_score?: number;
    assignment_method?: 'auto' | 'suggested' | 'manual';
    matched_keywords?: string[];
  };
  status: string;
  created_at: string;
}

interface Chapter {
  id: string;
  chapter_name: string;
  subject: string;
  batch_id: string | null;
}

interface Batch {
  id: string;
  name: string;
  exam_type: string;
  grade: number;
}

interface Topic {
  id: string;
  topic_name: string;
  chapter_id: string;
}

// Normalize text for duplicate detection
const normalizeText = (text: string): string => {
  return text.toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').trim();
};

export function ExtractionReviewQueue() {
  const [allQuestions, setAllQuestions] = useState<ExtractedQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [editedQuestion, setEditedQuestion] = useState<ExtractedQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [bookFilter, setBookFilter] = useState<string>("all");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [stats, setStats] = useState({ pending: 0, rejected: 0, questionBank: 0 });
  const [duplicateInfo, setDuplicateInfo] = useState<{ isDuplicate: boolean; similarity: number; existingId?: string } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [nlpProcessing, setNlpProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, approved: 0, skipped: 0 });
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    method: 'auto' | 'suggested' | 'all';
    questions: ExtractedQuestion[];
    skipDuplicates: boolean;
  } | null>(null);
  const [previewQuestion, setPreviewQuestion] = useState<ExtractedQuestion | null>(null);
  const [editingInPreview, setEditingInPreview] = useState(false);

  // Get unique source files (books) for filtering
  const sourceFiles = useMemo(() => {
    const files = new Set(allQuestions.map(q => q.source_file));
    return Array.from(files).sort();
  }, [allQuestions]);

  // Get unique subjects for filtering
  const subjects = useMemo(() => {
    const subjs = new Set(allQuestions.map(q => q.parsed_question.subject).filter(Boolean));
    return Array.from(subjs).sort();
  }, [allQuestions]);

  // Filtered questions based on book and subject
  const filteredQuestions = useMemo(() => {
    return allQuestions.filter(q => {
      if (bookFilter !== "all" && q.source_file !== bookFilter) return false;
      if (subjectFilter !== "all" && q.parsed_question.subject !== subjectFilter) return false;
      return true;
    });
  }, [allQuestions, bookFilter, subjectFilter]);

  const currentQuestion = filteredQuestions[currentIndex];

  // Reset index when filters change
  useEffect(() => {
    setCurrentIndex(0);
  }, [bookFilter, subjectFilter]);

  // Check for duplicates when current question changes
  useEffect(() => {
    if (currentQuestion && statusFilter === "pending") {
      checkForDuplicate(currentQuestion.parsed_question.question);
    } else {
      setDuplicateInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, filteredQuestions, statusFilter, currentQuestion?.id]);

  useEffect(() => {
    fetchQuestions();
    fetchChapters();
    fetchBatches();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const checkForDuplicate = async (questionText: string) => {
    if (!questionText || questionText.length < 20) {
      setDuplicateInfo(null);
      return;
    }

    setCheckingDuplicate(true);
    try {
      const searchWords = normalizeText(questionText).split(' ').slice(0, 5).join(' ');
      
      const { data: existingQuestions } = await supabase
        .from("questions")
        .select("id, question")
        .ilike("question", `%${searchWords.slice(0, 30)}%`)
        .limit(10);

      let bestMatch = { isDuplicate: false, similarity: 0, existingId: undefined as string | undefined };
      
      for (const existing of existingQuestions || []) {
        const similarity = quickTextSimilarity(questionText, existing.question);
        if (similarity > bestMatch.similarity) {
          bestMatch = {
            isDuplicate: similarity >= 85,
            similarity,
            existingId: similarity >= 60 ? existing.id : undefined
          };
        }
      }

      setDuplicateInfo(bestMatch);
    } catch (error) {
      logger.error("Duplicate check error:", error);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("extracted_questions_queue")
        .select("*")
        .eq("status", statusFilter as any)
        .order("created_at", { ascending: false })
        .limit(1000);

      if (error) throw error;
      
      const typedData = (data || []).map(item => ({
        ...item,
        parsed_question: item.parsed_question as ExtractedQuestion['parsed_question']
      }));
      
      setAllQuestions(typedData);
      setCurrentIndex(0);
    } catch (error) {
      logger.error("Error fetching questions:", error);
      toast.error("Failed to load questions");
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const [pending, rejected, questionBank] = await Promise.all([
        supabase.from("extracted_questions_queue").select("id", { count: "exact" }).eq("status", "pending"),
        supabase.from("extracted_questions_queue").select("id", { count: "exact" }).eq("status", "rejected"),
        supabase.from("questions").select("id", { count: "exact" }), // Single source of truth
      ]);
      
      setStats({
        pending: pending.count || 0,
        rejected: rejected.count || 0,
        questionBank: questionBank.count || 0
      });
    } catch (error) {
      logger.error("Error fetching stats:", error);
    }
  };

  const fetchChapters = async () => {
    try {
      // Fetch all available chapters with their batch info
      const { data } = await supabase
        .from("chapters")
        .select("id, chapter_name, subject, batch_id")
        .order('chapter_name');
      setChapters(data || []);
      clearCurriculumCache(); // Refresh NLP cache
    } catch (error) {
      logger.error("Error fetching chapters:", error);
      toast.error("Failed to load chapters");
    }
  };

  const fetchBatches = async () => {
    const { data } = await supabase.from("batches").select("id, name, exam_type, grade");
    setBatches(data || []);
  };

  // Helper function to get batch_id for an exam type
  const getBatchIdForExam = (examType: string | undefined): string | null | 'NOT_FOUND' => {
    if (!examType) return null;
    
    if (examType.startsWith('Foundation-')) {
      const grade = parseInt(examType.replace('Foundation-', ''));
      const batch = batches.find(b => b.exam_type === 'Foundation' && b.grade === grade);
      // Return 'NOT_FOUND' if batch should exist but isn't loaded yet
      return batch?.id || (batches.length === 0 ? 'NOT_FOUND' : 'NOT_FOUND');
    }
    
    // JEE/NEET - try to find batch for the exam type
    const jeeNeetMatch = examType.match(/^(Foundation-)?(?:(\d+)[a-z]+\s+)?(JEE|NEET)$/i);
    if (jeeNeetMatch) {
      const examName = jeeNeetMatch[3]; // JEE or NEET
      const grade = jeeNeetMatch[2] ? parseInt(jeeNeetMatch[2]) : 12; // Default to 12
      const batch = batches.find(b => 
        b.exam_type.toLowerCase() === examName.toLowerCase() && 
        b.grade === grade
      );
      return batch?.id || (batches.length === 0 ? 'NOT_FOUND' : 'NOT_FOUND');
    }
    
    // Fallback: Check if it's just "JEE" or "NEET"
    if (examType === 'JEE' || examType === 'NEET') {
      const batch = batches.find(b => b.exam_type === examType && (b.grade === 11 || b.grade === 12));
      return batch?.id || (batches.length === 0 ? 'NOT_FOUND' : 'NOT_FOUND');
    }
    
    return null;
  };

  // Filter chapters by subject AND exam type
  const getFilteredChapters = (subject: string | undefined, examType: string | undefined): Chapter[] => {
    if (!subject || !examType) return [];
    
    const batchId = getBatchIdForExam(examType);
    
    // If batch not found, return empty array (don't show other batch's chapters)
    if (batchId === 'NOT_FOUND') return [];
    
    // Filter by subject and batch_id
    if (batchId === null) {
      // Legacy: No batch_id filtering (shouldn't happen with current setup)
      return chapters.filter(c => c.subject === subject && !c.batch_id);
    }
    
    return chapters.filter(c => c.subject === subject && c.batch_id === batchId);
  };

  const fetchTopics = async (chapterId: string): Promise<Topic[]> => {
    const { data } = await supabase.from("topics").select("id, topic_name, chapter_id").eq("chapter_id", chapterId);
    const topicsList = data || [];
    setTopics(topicsList);
    return topicsList;
  };

  // Run NLP auto-assignment on filtered questions
  const handleNLPAutoAssign = async () => {
    if (filteredQuestions.length === 0) {
      toast.error("No questions to process");
      return;
    }

    setNlpProcessing(true);
    try {
      toast.info(`Running NLP on ${filteredQuestions.length} questions...`);
      
      const result = await bulkAutoAssign(filteredQuestions.map(q => q.id));
      
      toast.success(
        `NLP Complete: ${result.autoAssigned} auto-assigned, ${result.suggested} suggested, ${result.failed} failed`
      );
      
      await fetchQuestions();
    } catch (error) {
      logger.error("NLP error:", error);
      toast.error("NLP processing failed");
    } finally {
      setNlpProcessing(false);
    }
  };

  // Push approved question to database
  const handleApprove = async (forceApprove = false, overwrite = false) => {
    if (!currentQuestion) return;
    
    if (!forceApprove && duplicateInfo?.isDuplicate) {
      toast.error("Duplicate detected! Use force approve or skip.");
      return;
    }

    setSaving(true);
    try {
      const q = editedQuestion?.parsed_question || currentQuestion.parsed_question;

      // Validate ALL required fields for questions table
      const missingFields = [];
      if (!q.question?.trim()) missingFields.push("Question");
      if (!q.option_a?.trim()) missingFields.push("Option A");
      if (!q.option_b?.trim()) missingFields.push("Option B");
      if (!q.option_c?.trim()) missingFields.push("Option C");
      if (!q.option_d?.trim()) missingFields.push("Option D");
      if (!q.correct_option?.trim()) missingFields.push("Correct Answer");
      if (!q.subject?.trim()) missingFields.push("Subject");
      if (!q.difficulty?.trim()) missingFields.push("Difficulty");

      if (missingFields.length > 0) {
        toast.error(`Missing required fields: ${missingFields.join(", ")}`);
        setSaving(false);
        return;
      }

      // Get chapter/topic from NLP assignment or manual selection
      let chapterId = q.auto_assigned_chapter_id || null;
      let topicId = q.auto_assigned_topic_id || null;
      const chapterName = (q.auto_assigned_chapter_name || q.chapter || "").trim();
      const topicName = (q.auto_assigned_topic_name || q.topic || chapterName || "").trim();

      // AUTO-LOOKUP: If we have chapter name but no ID, find it from database
      if (!chapterId && chapterName && chapterName !== "General") {
        const matchedChapter = chapters.find(c => 
          c.chapter_name.toLowerCase() === chapterName.toLowerCase() && 
          c.subject.toLowerCase() === q.subject.toLowerCase()
        );
        if (matchedChapter) {
          chapterId = matchedChapter.id;
          logger.info(`Auto-mapped chapter "${chapterName}" to ID ${chapterId}`);
        }
      }

      // AUTO-LOOKUP: If we have topic name but no ID, find it from database
      if (!topicId && topicName && chapterId) {
        // Fetch topics for this chapter if not already loaded
        const { data: chapterTopics } = await supabase
          .from("topics")
          .select("id, topic_name")
          .eq("chapter_id", chapterId);
        
        const matchedTopic = (chapterTopics || []).find(t => 
          t.topic_name.toLowerCase() === topicName.toLowerCase()
        );
        if (matchedTopic) {
          topicId = matchedTopic.id;
          logger.info(`Auto-mapped topic "${topicName}" to ID ${topicId}`);
        }
      }

      // Determine if this is a Foundation or Scholarship exam (topic optional)
      const isFoundationOrScholarship = (examType: string): boolean => {
        return (examType || '').startsWith('Foundation-') || examType === 'Scholarship' || examType === 'Olympiad';
      };

      const examType = (q.exam || 'JEE').trim();
      const isFoundation = isFoundationOrScholarship(examType);

      // STRICT VALIDATION: chapter_id is required, but topic_id is optional for Foundation
      if (!chapterId) {
        const missingChapter = !chapterName ? "No chapter name provided" : `Chapter "${chapterName}" not found in database`;
        toast.error(`${missingChapter}. Please select a chapter manually using Edit.`);
        setSaving(false);
        return;
      }
      // Topic validation only for non-Foundation exams
      if (!isFoundation && !topicId) {
        const missingTopic = !topicName ? "No topic name provided" : `Topic "${topicName}" not found in database`;
        toast.error(`${missingTopic}. Please select a topic manually.`);
        setSaving(false);
        return;
      }
      
      // Final validation: Ensure chapter name is not empty
      if (!chapterName?.trim()) {
        toast.error("Chapter name is required. Please edit the question and select a chapter.");
        setSaving(false);
        return;
      }
      // Topic name validation only for non-Foundation exams
      if (!isFoundation && !topicName?.trim()) {
        toast.error("Topic name is required. Please edit the question and select a topic.");
        setSaving(false);
        return;
      }

      // Overwrite existing if requested
      if (overwrite && duplicateInfo?.existingId) {
        await supabase.from("questions").delete().eq("id", duplicateInfo.existingId);
      }

      // Derive question_type from extracted data (default single_correct)
      const qAny = q as any;
      const rawType = (qAny.question_type || "").toString().toLowerCase().trim();
      let questionType: "single_correct" | "multiple_correct" | "numerical" = "single_correct";
      if (rawType.includes("multi")) questionType = "multiple_correct";
      else if (rawType.includes("num") || rawType.includes("integer") || qAny.numerical_answer != null) questionType = "numerical";

      // Pick up matching chapter row to inherit batch_id (data integrity)
      const matchedChapterRow = chapters.find(c => c.id === chapterId);
      const inheritedBatchId = matchedChapterRow?.batch_id || null;

      // PYQ + numerical fields (optional but DB columns exist)
      const isPyq = !!(qAny.is_pyq || qAny.pyq_year || qAny.year);
      const pyqYear = qAny.pyq_year ?? qAny.year ?? null;
      const numericalAnswer = qAny.numerical_answer != null ? Number(qAny.numerical_answer) : null;

      // Insert into questions table with all required fields
      const { error: insertError } = await supabase.from("questions").insert({
        question: q.question.trim(),
        option_a: questionType === "numerical" ? null : q.option_a.trim(),
        option_b: questionType === "numerical" ? null : (q.option_b || "").trim(),
        option_c: questionType === "numerical" ? null : (q.option_c || "").trim(),
        option_d: questionType === "numerical" ? null : (q.option_d || "").trim(),
        correct_option: questionType === "numerical" ? null : q.correct_option.toUpperCase().trim(),
        numerical_answer: numericalAnswer,
        explanation: (q.explanation || "").trim(),
        subject: q.subject.trim(),
        chapter: chapterName.trim(),
        chapter_id: chapterId,
        topic: isFoundation ? null : topicName.trim(),
        topic_id: isFoundation ? null : topicId,
        difficulty: (q.difficulty || "Medium").trim(),
        exam: examType,
        question_type: questionType,
        batch_id: inheritedBatchId,
        is_active: true,
        is_verified: true, // admin-approved through this queue
        is_pyq: isPyq,
        pyq_year: pyqYear,
        source: qAny.source || "extraction_queue",
      } as any);

      if (insertError) throw insertError;

      // Mark as approved
      await supabase
        .from("extracted_questions_queue")
        .update({ status: "approved" })
        .eq("id", currentQuestion.id);

      toast.success("Question pushed to database!");
      
      setAllQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
      setEditMode(false);
      setEditedQuestion(null);
      setDuplicateInfo(null);
      fetchStats();
    } catch (error: any) {
      logger.error("Approve error:", error);
      toast.error(`Failed: ${error?.message || "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReject = async () => {
    if (!currentQuestion) return;
    setSaving(true);
    
    try {
      await supabase
        .from("extracted_questions_queue")
        .update({ status: "rejected" })
        .eq("id", currentQuestion.id);

      toast.info("Question rejected");
      setAllQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
      setEditMode(false);
      setEditedQuestion(null);
      fetchStats();
    } catch (error) {
      logger.error("Reject error:", error);
      toast.error("Failed to reject");
    } finally {
      setSaving(false);
    }
  };

  // Move approved/rejected question back to pending (e.g., needs diagram)
  const handleMoveToPending = async (reason?: string) => {
    if (!currentQuestion) return;
    setSaving(true);
    
    try {
      const updatedParsed = {
        ...currentQuestion.parsed_question,
        pending_reason: reason || "Moved back to pending",
        moved_to_pending_at: new Date().toISOString()
      };

      await supabase
        .from("extracted_questions_queue")
        .update({ 
          status: "pending",
          parsed_question: updatedParsed,
          review_notes: reason || "Moved back for review"
        })
        .eq("id", currentQuestion.id);

      toast.success("Question moved to pending");
      setAllQuestions(prev => prev.filter(q => q.id !== currentQuestion.id));
      setEditMode(false);
      setEditedQuestion(null);
      fetchStats();
    } catch (error) {
      logger.error("Move to pending error:", error);
      toast.error("Failed to move to pending");
    } finally {
      setSaving(false);
    }
  };

  // Bulk move questions back to pending
  const handleBulkMoveToPending = async (questionIds: string[], reason: string) => {
    if (questionIds.length === 0) {
      toast.error("No questions selected");
      return;
    }

    setBulkProcessing(true);
    try {
      for (const id of questionIds) {
        const question = allQuestions.find(q => q.id === id);
        if (!question) continue;

        const updatedParsed = {
          ...question.parsed_question,
          pending_reason: reason,
          moved_to_pending_at: new Date().toISOString()
        };

        await supabase
          .from("extracted_questions_queue")
          .update({ 
            status: "pending",
            parsed_question: updatedParsed,
            review_notes: reason
          })
          .eq("id", id);
      }

      toast.success(`${questionIds.length} questions moved to pending`);
      await fetchQuestions();
      await fetchStats();
    } catch (error) {
      logger.error("Bulk move error:", error);
      toast.error("Failed to move questions");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Open confirmation dialog before pushing
  const openConfirmDialog = (method: 'auto' | 'suggested' | 'all', skipDuplicates = true) => {
    const targetQuestions = method === 'all' 
      ? filteredQuestions 
      : filteredQuestions.filter(q => q.parsed_question.assignment_method === method);
    
    if (targetQuestions.length === 0) {
      toast.error(`No ${method === 'all' ? '' : method + ' '}questions to push`);
      return;
    }

    setConfirmDialog({
      open: true,
      method,
      questions: targetQuestions,
      skipDuplicates
    });
  };

  // Update a question in the confirmation preview
  const updateQuestionInPreview = (questionId: string, field: string, value: string) => {
    if (!confirmDialog) return;
    
    const updatedQuestions = confirmDialog.questions.map(q => {
      if (q.id === questionId) {
        return {
          ...q,
          parsed_question: { ...q.parsed_question, [field]: value }
        };
      }
      return q;
    });
    
    setConfirmDialog({ ...confirmDialog, questions: updatedQuestions });
    
    // Also update previewQuestion if it's the same one
    if (previewQuestion?.id === questionId) {
      setPreviewQuestion({
        ...previewQuestion,
        parsed_question: { ...previewQuestion.parsed_question, [field]: value }
      });
    }
  };

  // Push questions by assignment method (auto, suggested, or all)
  const handlePushByMethod = async (questionsToProcess: ExtractedQuestion[], skipDuplicates = true) => {
    if (questionsToProcess.length === 0) {
      toast.error("No questions to push");
      return;
    }

    setBulkProcessing(true);
    setBulkProgress({ current: 0, total: questionsToProcess.length, approved: 0, skipped: 0 });
    setConfirmDialog(null);

    try {
      let approved = 0;
      let skipped = 0;

      for (let i = 0; i < questionsToProcess.length; i++) {
        const question = questionsToProcess[i];
        const q = question.parsed_question;
        
        setBulkProgress(prev => ({ ...prev, current: i + 1 }));

        // Skip invalid questions - check ALL required fields
        const missingFields = [];
        if (!q.question?.trim()) missingFields.push("Question");
        if (!q.option_a?.trim()) missingFields.push("Option A");
        if (!q.option_b?.trim()) missingFields.push("Option B");
        if (!q.option_c?.trim()) missingFields.push("Option C");
        if (!q.option_d?.trim()) missingFields.push("Option D");
        if (!q.correct_option?.trim()) missingFields.push("Correct Answer");
        if (!q.subject?.trim()) missingFields.push("Subject");
        if (!q.difficulty?.trim()) missingFields.push("Difficulty");

        if (missingFields.length > 0) {
          logger.warn(`Skipping question ${question.id}: Missing fields: ${missingFields.join(", ")}`);
          skipped++;
          continue;
        }

        // Get curriculum assignment
        let chapterId = q.auto_assigned_chapter_id || null;
        let topicId = q.auto_assigned_topic_id || null;
        const chapterName = (q.auto_assigned_chapter_name || q.chapter || "").trim();
        const topicName = (q.auto_assigned_topic_name || q.topic || chapterName || "").trim();

        // AUTO-LOOKUP: If we have chapter name but no ID, find it from database
        if (!chapterId && chapterName && chapterName !== "General") {
          const matchedChapter = chapters.find(c => 
            c.chapter_name.toLowerCase() === chapterName.toLowerCase() && 
            c.subject.toLowerCase() === q.subject.toLowerCase()
          );
          if (matchedChapter) {
            chapterId = matchedChapter.id;
          }
        }

        // AUTO-LOOKUP: If we have topic name but no ID, find it from database
        if (!topicId && topicName && chapterId) {
          const { data: chapterTopics } = await supabase
            .from("topics")
            .select("id, topic_name")
            .eq("chapter_id", chapterId);
          
          const matchedTopic = (chapterTopics || []).find(t => 
            t.topic_name.toLowerCase() === topicName.toLowerCase()
          );
          if (matchedTopic) {
            topicId = matchedTopic.id;
          }
        }

        // Determine if Foundation exam (topic optional)
        const isFoundationOrScholarship = (examType: string): boolean => {
          return (examType || '').startsWith('Foundation-') || examType === 'Scholarship' || examType === 'Olympiad';
        };
        const examType = (q.exam || 'JEE').trim();
        const isFoundation = isFoundationOrScholarship(examType);

        // STRICT VALIDATION: chapter_id is required, topic_id optional for Foundation
        if (!chapterId) {
          logger.warn(`Skipping question ${question.id}: Missing chapter_id - Chapter: "${chapterName}"`);
          skipped++;
          continue;
        }
        
        // Topic validation only for non-Foundation exams
        if (!isFoundation && !topicId) {
          logger.warn(`Skipping question ${question.id}: Missing topic_id for non-Foundation exam - Topic: "${topicName}"`);
          skipped++;
          continue;
        }
        
        if (!chapterName?.trim()) {
          logger.warn(`Skipping question ${question.id}: Missing chapter name`);
          skipped++;
          continue;
        }
        
        if (!isFoundation && !topicName?.trim()) {
          logger.warn(`Skipping question ${question.id}: Missing topic name for non-Foundation exam`);
          skipped++;
          continue;
        }

        // Check for duplicates if requested
        if (skipDuplicates) {
          const searchWords = normalizeText(q.question).split(' ').slice(0, 5).join(' ');
          const { data: existing } = await supabase
            .from("questions")
            .select("id, question")
            .ilike("question", `%${searchWords.slice(0, 30)}%`)
            .limit(5);

          const isDuplicate = (existing || []).some(e => 
            quickTextSimilarity(q.question, e.question) >= 85
          );

          if (isDuplicate) {
            await supabase
              .from("extracted_questions_queue")
              .update({ status: "rejected", review_notes: "Duplicate" })
              .eq("id", question.id);
            skipped++;
            continue;
          }
        }

        // Insert into database with all required fields properly trimmed
        const { error } = await supabase.from("questions").insert({
          question: q.question.trim(),
          option_a: q.option_a.trim(),
          option_b: (q.option_b || "").trim(),
          option_c: (q.option_c || "").trim(),
          option_d: (q.option_d || "").trim(),
          correct_option: q.correct_option.toUpperCase().trim(),
          explanation: (q.explanation || "").trim(),
          subject: q.subject.trim(),
          chapter: chapterName.trim(),
          chapter_id: chapterId,
          topic: isFoundation ? null : topicName.trim(),
          topic_id: isFoundation ? null : topicId,
          difficulty: (q.difficulty || "Medium").trim(),
          exam: (q.exam || "JEE").trim(),
          question_type: "single_correct"
        });

        if (!error) {
          await supabase
            .from("extracted_questions_queue")
            .update({ status: "approved" })
            .eq("id", question.id);
          approved++;
        } else {
          logger.error(`Insert error for question ${question.id}:`, error);
          skipped++;
        }

        setBulkProgress(prev => ({ ...prev, approved, skipped }));
      }

      toast.success(`Push complete: ${approved} approved, ${skipped} skipped`);
      await fetchQuestions();
      await fetchStats();
    } catch (error) {
      logger.error("Push error:", error);
      toast.error("Push processing failed");
    } finally {
      setBulkProcessing(false);
    }
  };

  // Get counts by assignment method
  const getMethodCounts = () => {
    const autoCount = filteredQuestions.filter(q => q.parsed_question.assignment_method === 'auto').length;
    const suggestedCount = filteredQuestions.filter(q => q.parsed_question.assignment_method === 'suggested').length;
    const manualCount = filteredQuestions.filter(q => !q.parsed_question.assignment_method || q.parsed_question.assignment_method === 'manual').length;
    return { autoCount, suggestedCount, manualCount };
  };

  const handleEdit = () => {
    if (!currentQuestion) return;
    setEditedQuestion({ ...currentQuestion });
    setEditMode(true);
    
    // Load topics for assigned chapter
    const chapterId = currentQuestion.parsed_question.auto_assigned_chapter_id;
    if (chapterId) fetchTopics(chapterId);
  };

  const updateEditedField = (field: string, value: string) => {
    if (!editedQuestion) return;
    setEditedQuestion({
      ...editedQuestion,
      parsed_question: { ...editedQuestion.parsed_question, [field]: value }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => setStatusFilter("pending")}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-500">{stats.pending}</div>
            <div className="text-sm text-muted-foreground">Pending Review</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50" onClick={() => setStatusFilter("rejected")}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-500">{stats.rejected}</div>
            <div className="text-sm text-muted-foreground">Rejected</div>
          </CardContent>
        </Card>
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-primary flex items-center gap-2">
              <Database className="h-5 w-5" />
              {stats.questionBank}
            </div>
            <div className="text-sm text-muted-foreground">Question Bank (Live DB)</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label className="mb-2 block text-sm">Book/Source File</Label>
              <Select value={bookFilter} onValueChange={setBookFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All books" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Books ({allQuestions.length})</SelectItem>
                  {sourceFiles.map(file => (
                    <SelectItem key={file} value={file}>
                      {file.length > 40 ? file.slice(0, 40) + "..." : file}
                      {" "}({allQuestions.filter(q => q.source_file === file).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="mb-2 block text-sm">Subject</Label>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All subjects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {subjects.map(subj => (
                    <SelectItem key={subj} value={subj}>{subj}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setBookFilter("all"); setSubjectFilter("all"); }}>
                Clear Filters
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            Showing {filteredQuestions.length} of {allQuestions.length} questions
          </p>
        </CardContent>
      </Card>

      {/* NLP & Bulk Actions */}
      {statusFilter === "pending" && filteredQuestions.length > 0 && (() => {
        const { autoCount, suggestedCount, manualCount } = getMethodCounts();
        return (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 space-y-4">
              {/* Step 1: Run NLP */}
              <div className="flex flex-wrap gap-3 items-center justify-between">
                <div>
                  <h4 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Step 1: Run NLP Auto-Assignment
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Analyze questions and assign chapters/topics automatically
                  </p>
                </div>
                <Button
                  onClick={handleNLPAutoAssign}
                  disabled={nlpProcessing || bulkProcessing}
                  className="gap-2"
                >
                  {nlpProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Run NLP ({filteredQuestions.length})
                </Button>
              </div>

              <Separator />

              {/* Step 2: Push to Database */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4" />
                  Step 2: Push to Database
                </h4>
                
                {/* Stats Row */}
                <div className="flex flex-wrap gap-4 mb-3">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-green-600">{autoCount}</Badge>
                    <span className="text-sm">Auto-Assigned (≥70% confidence)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">{suggestedCount}</Badge>
                    <span className="text-sm">Suggested (35-70% confidence)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{manualCount}</Badge>
                    <span className="text-sm">Manual Review Required</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() => openConfirmDialog('auto', true)}
                    disabled={nlpProcessing || bulkProcessing || autoCount === 0}
                    className="gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <Eye className="h-4 w-4" />
                    Review & Push Auto ({autoCount})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openConfirmDialog('suggested', true)}
                    disabled={nlpProcessing || bulkProcessing || suggestedCount === 0}
                    className="gap-2 border-yellow-500 text-yellow-600 hover:bg-yellow-500/10"
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit & Push Suggested ({suggestedCount})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => openConfirmDialog('all', true)}
                    disabled={nlpProcessing || bulkProcessing}
                    className="gap-2"
                  >
                    <Database className="h-4 w-4" />
                    Review All (Skip Duplicates)
                  </Button>
                </div>
              </div>

              {bulkProcessing && (
                <div className="mt-4 space-y-2">
                  <Progress value={(bulkProgress.current / bulkProgress.total) * 100} />
                  <p className="text-sm text-muted-foreground">
                    Processing {bulkProgress.current}/{bulkProgress.total} - 
                    <span className="text-green-500 ml-1">{bulkProgress.approved} approved</span>,
                    <span className="text-yellow-500 ml-1">{bulkProgress.skipped} skipped</span>
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Main Review Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Review Queue - {statusFilter}
              </CardTitle>
              <CardDescription>
                {filteredQuestions.length} questions {bookFilter !== "all" && `from "${bookFilter}"`}
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchQuestions} disabled={bulkProcessing}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No {statusFilter} questions {bookFilter !== "all" && `from this book`}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" disabled={currentIndex === 0} onClick={() => setCurrentIndex(prev => prev - 1)}>
                  <ChevronLeft className="h-4 w-4" /> Previous
                </Button>
                <span className="text-sm text-muted-foreground">{currentIndex + 1} of {filteredQuestions.length}</span>
                <Button variant="outline" size="sm" disabled={currentIndex >= filteredQuestions.length - 1} onClick={() => setCurrentIndex(prev => prev + 1)}>
                  Next <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Separator />

              {/* Question Display */}
              {currentQuestion && (
                <div className="space-y-4">
                  {/* Source & Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline"><FileText className="h-3 w-3 mr-1" />{currentQuestion.source_file.slice(0, 30)}</Badge>
                    <Badge variant="outline">Page {currentQuestion.page_number}</Badge>
                    <Badge>{currentQuestion.parsed_question.subject || "Unknown"}</Badge>
                    <Badge variant="secondary">{currentQuestion.parsed_question.difficulty || "Medium"}</Badge>
                    
                    {/* NLP Assignment Badge */}
                    {currentQuestion.parsed_question.assignment_method && (
                      <Badge 
                        variant={currentQuestion.parsed_question.assignment_method === 'auto' ? 'default' : 'outline'}
                        className={currentQuestion.parsed_question.assignment_method === 'auto' ? 'bg-green-600' : 'border-yellow-500 text-yellow-600'}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        {currentQuestion.parsed_question.assignment_method === 'auto' ? 'Auto' : 'Suggested'} 
                        ({Math.round(currentQuestion.parsed_question.confidence_score || 0)}%)
                      </Badge>
                    )}

                    {checkingDuplicate && <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Checking...</Badge>}
                    {duplicateInfo?.isDuplicate && (
                      <Badge variant="destructive"><Copy className="h-3 w-3 mr-1" />Duplicate ({Math.round(duplicateInfo.similarity)}%)</Badge>
                    )}
                  </div>

                  {/* NLP Assignment Info */}
                  {currentQuestion.parsed_question.auto_assigned_chapter_name && (
                    <Alert className="bg-primary/5 border-primary/30">
                      <Sparkles className="h-4 w-4" />
                      <AlertDescription>
                        <span className="font-medium">NLP Assignment:</span>{" "}
                        {currentQuestion.parsed_question.auto_assigned_chapter_name}
                        {currentQuestion.parsed_question.auto_assigned_topic_name && (
                          <> → {currentQuestion.parsed_question.auto_assigned_topic_name}</>
                        )}
                        {currentQuestion.parsed_question.matched_keywords && (
                          <div className="text-xs mt-1 text-muted-foreground">
                            Matched: {currentQuestion.parsed_question.matched_keywords.slice(0, 5).join(", ")}
                          </div>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Duplicate Warning */}
                  {duplicateInfo?.isDuplicate && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Duplicate Detected!</strong>
                        <div className="flex gap-2 mt-2">
                          <Button size="sm" variant="outline" onClick={handleReject} disabled={saving}>
                            <SkipForward className="h-3 w-3 mr-1" /> Skip
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleApprove(true, true)} disabled={saving} className="border-orange-500 text-orange-600">
                            <Replace className="h-3 w-3 mr-1" /> Overwrite
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}

                  {editMode && editedQuestion ? (
                    /* Edit Mode */
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Question</Label>
                        <Textarea value={editedQuestion.parsed_question.question} onChange={(e) => updateEditedField("question", e.target.value)} rows={4} />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        {["a", "b", "c", "d"].map(opt => (
                          <div key={opt} className="space-y-2">
                            <Label>Option {opt.toUpperCase()}</Label>
                            <Input 
                              value={(editedQuestion.parsed_question as any)[`option_${opt}`]} 
                              onChange={(e) => updateEditedField(`option_${opt}`, e.target.value)} 
                            />
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2">
                          <Label>Course Type</Label>
                          <Select 
                            value={editedQuestion.parsed_question.exam || "JEE"} 
                            onValueChange={(v) => {
                              updateEditedField("exam", v);
                              // Reset chapter and topic when exam changes
                              updateEditedField("auto_assigned_chapter_id", "");
                              updateEditedField("auto_assigned_chapter_name", "");
                              updateEditedField("auto_assigned_topic_id", "");
                              updateEditedField("auto_assigned_topic_name", "");
                            }}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">COMPETITIVE EXAMS</div>
                              <SelectItem value="JEE">JEE Main & Advanced</SelectItem>
                              <SelectItem value="NEET">NEET Medical</SelectItem>
                              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">FOUNDATION</div>
                              <SelectItem value="Foundation-6">6th Foundation</SelectItem>
                              <SelectItem value="Foundation-7">7th Foundation</SelectItem>
                              <SelectItem value="Foundation-8">8th Foundation</SelectItem>
                              <SelectItem value="Foundation-9">9th Foundation</SelectItem>
                              <SelectItem value="Foundation-10">10th Foundation</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Correct Answer</Label>
                          <Select value={editedQuestion.parsed_question.correct_option} onValueChange={(v) => updateEditedField("correct_option", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["A", "B", "C", "D"].map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Subject</Label>
                          <Select value={editedQuestion.parsed_question.subject} onValueChange={(v) => updateEditedField("subject", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(
                                editedQuestion?.parsed_question?.exam
                                  ? (PROGRAM_SUBJECTS[normalizeProgram(editedQuestion.parsed_question.exam)] || PROGRAM_SUBJECTS['Class'])
                                  : (subjects.length > 0 ? subjects : PROGRAM_SUBJECTS['Class'])
                              ).map((s: string) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Difficulty</Label>
                          <Select value={editedQuestion.parsed_question.difficulty || "Medium"} onValueChange={(v) => updateEditedField("difficulty", v)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["Easy", "Medium", "Hard"].map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Chapter (from curriculum) <span className="text-red-500">*</span></Label>
                        <Select 
                          value={editedQuestion.parsed_question.auto_assigned_chapter_id || ""} 
                          onValueChange={async (v) => {
                            const chapter = chapters.find(c => c.id === v);
                            updateEditedField("auto_assigned_chapter_id", v);
                            updateEditedField("auto_assigned_chapter_name", chapter?.chapter_name || "");
                            if (v) {
                              const topicsList = await fetchTopics(v);
                              if (topicsList.length > 0) {
                                updateEditedField("auto_assigned_topic_id", topicsList[0].id);
                                updateEditedField("auto_assigned_topic_name", topicsList[0].topic_name);
                              }
                            }
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select chapter" /></SelectTrigger>
                          <SelectContent>
                            <ScrollArea className="h-60">
                              {getFilteredChapters(editedQuestion.parsed_question.subject, editedQuestion.parsed_question.exam).map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.chapter_name}</SelectItem>
                              ))}
                            </ScrollArea>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Topic <span className="text-red-500">*</span></Label>
                        <Select 
                          value={editedQuestion.parsed_question.auto_assigned_topic_id || ""} 
                          onValueChange={(v) => {
                            const topic = topics.find(t => t.id === v);
                            updateEditedField("auto_assigned_topic_id", v);
                            updateEditedField("auto_assigned_topic_name", topic?.topic_name || "");
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Select topic" /></SelectTrigger>
                          <SelectContent>
                            <ScrollArea className="h-60">
                              {topics.map(t => (
                                <SelectItem key={t.id} value={t.id}>{t.topic_name}</SelectItem>
                              ))}
                            </ScrollArea>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Explanation</Label>
                        <Textarea value={editedQuestion.parsed_question.explanation || ""} onChange={(e) => updateEditedField("explanation", e.target.value)} rows={2} />
                      </div>
                    </div>
                  ) : (
                    /* View Mode */
                    <div className="space-y-4">
                      <div className="p-4 bg-muted rounded-lg">
                        <div className="font-medium whitespace-pre-wrap">
                          <MathDisplay text={currentQuestion.parsed_question.question} />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {["A", "B", "C", "D"].map(opt => {
                          const optionKey = `option_${opt.toLowerCase()}` as keyof typeof currentQuestion.parsed_question;
                          const isCorrect = currentQuestion.parsed_question.correct_option?.toUpperCase() === opt;
                          const optionText = currentQuestion.parsed_question[optionKey] as string;
                          return (
                            <div key={opt} className={`p-3 rounded-lg border ${isCorrect ? "bg-green-500/10 border-green-500" : "bg-card"}`}>
                              <span className="font-semibold mr-2">({opt})</span>
                              <MathDisplay text={optionText || ''} />
                              {isCorrect && <CheckCircle2 className="h-4 w-4 inline ml-2 text-green-500" />}
                            </div>
                          );
                        })}
                      </div>

                      {currentQuestion.parsed_question.explanation && (
                        <div className="p-3 bg-blue-500/10 rounded-lg">
                          <p className="text-sm font-medium mb-1">Explanation:</p>
                          <div className="text-sm"><MathDisplay text={currentQuestion.parsed_question.explanation} /></div>
                        </div>
                      )}

                      <div className="flex gap-2 flex-wrap">
                        <Badge variant="outline">Chapter: {currentQuestion.parsed_question.auto_assigned_chapter_name || currentQuestion.parsed_question.chapter || "Not set"}</Badge>
                        <Badge variant="outline">Topic: {currentQuestion.parsed_question.auto_assigned_topic_name || currentQuestion.parsed_question.topic || "Not set"}</Badge>
                      </div>
                    </div>
                  )}

                  <Separator />

                  {/* Action Buttons */}
                  {statusFilter === "pending" && (
                    <div className="flex gap-2 justify-end flex-wrap">
                      {editMode ? (
                        <Button variant="outline" onClick={() => { setEditMode(false); setEditedQuestion(null); }}>Cancel</Button>
                      ) : (
                        <Button variant="outline" onClick={handleEdit}><Edit2 className="h-4 w-4 mr-2" />Edit</Button>
                      )}
                      <Button variant="outline" onClick={handleReject} disabled={saving}>
                        <XCircle className="h-4 w-4 mr-2" />Reject
                      </Button>
                      <Button 
                        onClick={() => handleApprove(duplicateInfo?.isDuplicate)} 
                        disabled={saving || (duplicateInfo?.isDuplicate && !editMode)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                        Push to Database
                      </Button>
                    </div>
                  )}
                  
                  {/* Move to Pending for Approved/Rejected questions */}
                  {(statusFilter === "approved" || statusFilter === "rejected") && (
                    <div className="flex gap-2 justify-between flex-wrap items-center">
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          onClick={() => handleMoveToPending("Needs diagram/image")}
                          disabled={saving}
                          className="gap-2 border-orange-500 text-orange-600 hover:bg-orange-500/10"
                        >
                          <ImageOff className="h-4 w-4" />
                          Needs Diagram
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => handleMoveToPending("Wrong topic assignment")}
                          disabled={saving}
                          className="gap-2"
                        >
                          <Undo2 className="h-4 w-4" />
                          Wrong Topic
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => handleMoveToPending()}
                          disabled={saving}
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Move to Pending
                        </Button>
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {statusFilter === "approved" ? "Question is in main database" : "Question was rejected"}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog with Preview & Edit */}
      <Dialog open={confirmDialog?.open || false} onOpenChange={(open) => {
        if (!open) {
          setConfirmDialog(null);
          setPreviewQuestion(null);
          setEditingInPreview(false);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {confirmDialog?.method === 'auto' && <><CheckCircle2 className="h-5 w-5 text-green-500" /> Review Auto-Assigned Questions</>}
              {confirmDialog?.method === 'suggested' && <><Edit2 className="h-5 w-5 text-yellow-500" /> Edit & Push Suggested Questions</>}
              {confirmDialog?.method === 'all' && <><Database className="h-5 w-5" /> Review All Questions</>}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog?.questions.length} questions. 
              <span className="text-green-600 font-medium ml-1">
                {confirmDialog?.questions.filter(q => q.parsed_question.auto_assigned_chapter_id && q.parsed_question.auto_assigned_topic_id).length} valid
              </span>,
              <span className="text-red-600 font-medium ml-1">
                {confirmDialog?.questions.filter(q => !q.parsed_question.auto_assigned_chapter_id || !q.parsed_question.auto_assigned_topic_id).length} missing chapter/topic (will be skipped)
              </span>
              {confirmDialog?.method === 'suggested' && ". Click on a question to edit before pushing."}
              {confirmDialog?.method === 'auto' && ". Review assignments before pushing to database."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex gap-4">
            {/* Questions List */}
            <div className="w-1/2 flex flex-col">
              <ScrollArea className="flex-1 border rounded-lg p-2">
                <div className="space-y-2">
                  {confirmDialog?.questions.map((q, idx) => (
                    <div 
                      key={q.id}
                      onClick={() => {
                        setPreviewQuestion(q);
                        if (confirmDialog?.method === 'suggested') {
                          fetchTopics(q.parsed_question.auto_assigned_chapter_id || '');
                        }
                      }}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        previewQuestion?.id === q.id 
                          ? 'border-primary bg-primary/10' 
                          : (!q.parsed_question.auto_assigned_chapter_id || !q.parsed_question.auto_assigned_topic_id)
                            ? 'border-red-300 bg-red-50 dark:bg-red-950/20 hover:bg-red-100'
                            : 'hover:bg-muted/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {idx + 1}. {q.parsed_question.question.slice(0, 60)}...
                          </p>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">{q.parsed_question.subject}</Badge>
                            {q.parsed_question.auto_assigned_chapter_name ? (
                              <Badge variant="secondary" className="text-xs truncate max-w-[150px]">
                                {q.parsed_question.auto_assigned_chapter_name}
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="text-xs">No Chapter</Badge>
                            )}
                            {!q.parsed_question.auto_assigned_topic_id && (
                              <Badge variant="destructive" className="text-xs">No Topic</Badge>
                            )}
                          </div>
                        </div>
                        <Badge 
                          className={q.parsed_question.assignment_method === 'auto' 
                            ? 'bg-green-600 shrink-0' 
                            : 'bg-yellow-600 shrink-0'
                          }
                        >
                          {Math.round(q.parsed_question.confidence_score || 0)}%
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Preview/Edit Panel */}
            <div className="w-1/2 flex flex-col">
              {previewQuestion ? (
                <ScrollArea className="flex-1 border rounded-lg p-4">
                  <div className="space-y-4">
                    {/* Question */}
                    <div>
                      <Label className="text-xs text-muted-foreground">Question</Label>
                      {editingInPreview && confirmDialog?.method === 'suggested' ? (
                        <Textarea 
                          value={previewQuestion.parsed_question.question}
                          onChange={(e) => updateQuestionInPreview(previewQuestion.id, 'question', e.target.value)}
                          rows={3}
                          className="mt-1"
                        />
                      ) : (
                        <div className="p-2 bg-muted rounded text-sm mt-1">
                          <MathDisplay text={previewQuestion.parsed_question.question} />
                        </div>
                      )}
                    </div>

                    {/* Options */}
                    <div className="grid grid-cols-2 gap-2">
                      {['A', 'B', 'C', 'D'].map(opt => {
                        const key = `option_${opt.toLowerCase()}` as keyof typeof previewQuestion.parsed_question;
                        const isCorrect = previewQuestion.parsed_question.correct_option?.toUpperCase() === opt;
                        return (
                          <div key={opt} className={`p-2 rounded border text-sm ${isCorrect ? 'bg-green-500/10 border-green-500' : ''}`}>
                            <span className="font-medium">({opt})</span> {previewQuestion.parsed_question[key] as string}
                            {isCorrect && <CheckCircle2 className="h-3 w-3 inline ml-1 text-green-500" />}
                          </div>
                        );
                      })}
                    </div>

                    {/* Course Type Selector */}
                    {(editingInPreview || confirmDialog?.method === 'suggested') && (
                      <div className="pt-2 border-t">
                        <Label className="text-xs text-muted-foreground">Course Type</Label>
                        <Select 
                          value={previewQuestion.parsed_question.exam || "JEE"} 
                          onValueChange={(v) => {
                            updateQuestionInPreview(previewQuestion.id, 'exam', v);
                            // Reset chapter and topic when exam changes
                            updateQuestionInPreview(previewQuestion.id, 'auto_assigned_chapter_id', '');
                            updateQuestionInPreview(previewQuestion.id, 'auto_assigned_chapter_name', '');
                            updateQuestionInPreview(previewQuestion.id, 'auto_assigned_topic_id', '');
                            updateQuestionInPreview(previewQuestion.id, 'auto_assigned_topic_name', '');
                          }}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">COMPETITIVE EXAMS</div>
                            <SelectItem value="JEE">JEE Main & Advanced</SelectItem>
                            <SelectItem value="NEET">NEET Medical</SelectItem>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">FOUNDATION</div>
                            <SelectItem value="Foundation-6">6th Foundation</SelectItem>
                            <SelectItem value="Foundation-7">7th Foundation</SelectItem>
                            <SelectItem value="Foundation-8">8th Foundation</SelectItem>
                            <SelectItem value="Foundation-9">9th Foundation</SelectItem>
                            <SelectItem value="Foundation-10">10th Foundation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* Chapter & Topic Assignment */}
                    <div className="space-y-3 pt-2 border-t">
                      <div>
                        <Label className="text-xs text-muted-foreground">Chapter Assignment</Label>
                        {(editingInPreview || confirmDialog?.method === 'suggested') ? (
                          <Select 
                            value={previewQuestion.parsed_question.auto_assigned_chapter_id || ""} 
                            onValueChange={async (v) => {
                              const chapter = chapters.find(c => c.id === v);
                              updateQuestionInPreview(previewQuestion.id, 'auto_assigned_chapter_id', v);
                              updateQuestionInPreview(previewQuestion.id, 'auto_assigned_chapter_name', chapter?.chapter_name || '');
                              // Reset topic when chapter changes; topic must be picked manually or matched explicitly.
                              updateQuestionInPreview(previewQuestion.id, 'auto_assigned_topic_id', '');
                              updateQuestionInPreview(previewQuestion.id, 'auto_assigned_topic_name', '');
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select chapter" />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-60">
                                {getFilteredChapters(previewQuestion.parsed_question.subject, previewQuestion.parsed_question.exam).map(c => (
                                  <SelectItem key={c.id} value={c.id}>{c.chapter_name}</SelectItem>
                                ))}
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm font-medium mt-1">
                            {previewQuestion.parsed_question.auto_assigned_chapter_name || 'Not assigned'}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label className="text-xs text-muted-foreground">Topic Assignment</Label>
                        {(editingInPreview || confirmDialog?.method === 'suggested') ? (
                          <Select 
                            value={previewQuestion.parsed_question.auto_assigned_topic_id || ""} 
                            onValueChange={(v) => {
                              const topic = topics.find(t => t.id === v);
                              updateQuestionInPreview(previewQuestion.id, 'auto_assigned_topic_id', v);
                              updateQuestionInPreview(previewQuestion.id, 'auto_assigned_topic_name', topic?.topic_name || '');
                            }}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select topic" />
                            </SelectTrigger>
                            <SelectContent>
                              <ScrollArea className="h-60">
                                {topics.map(t => (
                                  <SelectItem key={t.id} value={t.id}>{t.topic_name}</SelectItem>
                                ))}
                              </ScrollArea>
                            </SelectContent>
                          </Select>
                        ) : (
                          <p className="text-sm font-medium mt-1">
                            {previewQuestion.parsed_question.auto_assigned_topic_name || 'Not assigned'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Edit toggle for auto questions */}
                    {confirmDialog?.method === 'auto' && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setEditingInPreview(!editingInPreview)}
                        className="w-full"
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        {editingInPreview ? 'Done Editing' : 'Edit Assignment'}
                      </Button>
                    )}
                  </div>
                </ScrollArea>
              ) : (
                <div className="flex-1 border rounded-lg flex items-center justify-center text-muted-foreground">
                  <div className="text-center">
                    <Eye className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Click a question to preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancel
            </Button>
            <Button 
              onClick={() => confirmDialog && handlePushByMethod(confirmDialog.questions, confirmDialog.skipDuplicates)}
              disabled={bulkProcessing}
              className="bg-green-600 hover:bg-green-700"
            >
              {bulkProcessing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Confirm & Push {confirmDialog?.questions.length} Questions
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
