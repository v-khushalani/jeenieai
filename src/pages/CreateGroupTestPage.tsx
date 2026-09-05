import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Users, Share2, Copy, Check, MessageCircle, QrCode,  XCircle
} from "lucide-react";
import { generateTestCode, generateQRCodeSVG } from "@/utils/qrCode";
import { logger } from "@/utils/logger";
import { parseGrade } from "@/utils/gradeParser";
import { getBatchForStudent, getAllowedSubjects, getFilteredSubjects } from "@/utils/batchConfig";
import { mapBatchToExamValues } from "@/utils/batchQueryBuilder";
import { getExamPattern } from "@/config/examPatterns";
import { getSubjectAliases } from "@/lib/subjectNormalization";

const APP_URL = window.location.origin;

type GroupTestType = "custom" | "jee_mains_full" | "neet_full" | "mht_cet_full";

const GROUP_TEST_PRESETS: Record<Exclude<GroupTestType, "custom">, {
  label: string;
  description: string;
  patternName: string;
  examAliases: string[];
}> = {
  jee_mains_full: {
    label: "JEE Mains Full Syllabus",
    description: "75 questions, 180 min, real JEE Mains split",
    patternName: "JEE Mains",
    examAliases: ["JEE"],
  },
  neet_full: {
    label: "NEET Full Syllabus",
    description: "200 questions, 200 min, real NEET split",
    patternName: "NEET",
    examAliases: ["NEET"],
  },
  mht_cet_full: {
    label: "MHT-CET Full Syllabus",
    description: "150 questions, 180 min, real CET split",
    patternName: "MHT-CET",
    examAliases: ["MHT-CET", "MH-CET", "MH_CET"],
  },
};

const ALL_GRADES = [6, 7, 8, 9, 10, 11, 12];

type Track = "Foundation" | "JEE" | "NEET" | "MHT-CET";

const TRACK_EXAM_VALUES: Record<Track, string[]> = {
  Foundation: ["Foundation", "Scholarship"],
  JEE: mapBatchToExamValues("JEE"),
  NEET: mapBatchToExamValues("NEET"),
  "MHT-CET": ["MHT-CET", "MH-CET", "MH_CET"],
};

const TRACK_SUBJECTS: Record<Track, string[]> = {
  Foundation: ["Physics", "Chemistry", "Mathematics", "Biology"],
  JEE: ["Physics", "Chemistry", "Mathematics"],
  NEET: ["Physics", "Chemistry", "Biology"],
  "MHT-CET": ["Physics", "Chemistry", "Mathematics"],
};

interface ChapterRow {
  id: string;
  subject: string;
  chapter_name: string;
  class_level: number | null;
}

const CreateGroupTestPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Setup state
  const [step, setStep] = useState<"setup" | "share">("setup");
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);
  const [track, setTrack] = useState<Track>("JEE");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [chapterRows, setChapterRows] = useState<ChapterRow[]>([]);
  const [chapters, setChapters] = useState<Record<string, string[]>>({});
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedChapters, setSelectedChapters] = useState<{ subject: string; chapter: string }[]>([]);
  const [groupTestType, setGroupTestType] = useState<GroupTestType>("custom");
  const [questionCount, setQuestionCount] = useState(25);
  const [duration, setDuration] = useState(60);
  const [title, setTitle] = useState("");
  const [expiryHours, setExpiryHours] = useState<number | null>(24);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Share state
  const [testCode, setTestCode] = useState("");
  const [testId, setTestId] = useState("");
  const [qrSvg, setQrSvg] = useState("");
  const [copied, setCopied] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const hasSeniorGrade = selectedGrades.some((g) => g >= 11);
  const hasJuniorGrade = selectedGrades.some((g) => g <= 10);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("my_profile" as any).select("*").maybeSingle();
    setProfile(data);
  }, [user]);

  // The teacher's own saved class is only a convenience pre-selection — it must
  // never restrict which classes they can build a test for.
  useEffect(() => {
    if (!profile || selectedGrades.length > 0) return;
    const ownGrade = parseGrade(profile.grade || 12);
    if (ALL_GRADES.includes(ownGrade)) setSelectedGrades([ownGrade]);
    const exam = String(profile.target_exam || "").toUpperCase();
    if (ownGrade <= 10) setTrack("Foundation");
    else if (exam.includes("NEET")) setTrack("NEET");
    else if (exam.includes("CET")) setTrack("MHT-CET");
    else setTrack("JEE");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Keep track sensible when the class mix changes.
  useEffect(() => {
    if (hasJuniorGrade && !hasSeniorGrade && track !== "Foundation") setTrack("Foundation");
    if (hasSeniorGrade && !hasJuniorGrade && track === "Foundation") setTrack("JEE");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasJuniorGrade, hasSeniorGrade]);

  const fetchSubjectsAndChapters = useCallback(async () => {
    if (!user || selectedGrades.length === 0) {
      setSubjects([]);
      setChapters({});
      setChapterRows([]);
      return;
    }
    setChaptersLoading(true);
    try {
      const subjectsToShow = TRACK_SUBJECTS[track];

      const { data: chaptersData } = await supabase
        .from("chapters")
        .select("id, subject, chapter_name, chapter_number, class_level")
        .in("subject", subjectsToShow)
        .in("class_level", selectedGrades)
        .or("is_active.is.null,is_active.eq.true")
        .order("chapter_number");

      const rows = (chaptersData || []) as ChapterRow[];
      const bySubject: Record<string, string[]> = {};
      subjectsToShow.forEach((s) => {
        bySubject[s] = Array.from(
          new Set(rows.filter((c) => c.subject === s).map((c) => c.chapter_name))
        );
      });
      setSubjects(subjectsToShow);
      setChapterRows(rows);
      setChapters(bySubject);
      setSelectedSubjects((prev) => prev.filter((s) => subjectsToShow.includes(s)));
      setSelectedChapters((prev) => prev.filter((ch) => bySubject[ch.subject]?.includes(ch.chapter)));
    } finally {
      setChaptersLoading(false);
    }
  }, [user, selectedGrades, track]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    fetchSubjectsAndChapters();
  }, [fetchSubjectsAndChapters]);

  useEffect(() => {
    if (groupTestType === "custom") return;

    const preset = GROUP_TEST_PRESETS[groupTestType];
    const pattern = getExamPattern(preset.patternName);
    setQuestionCount(pattern.totalQuestions);
    setDuration(pattern.duration);
    setSelectedSubjects([]);
    setSelectedChapters([]);
  }, [groupTestType]);

  // Full-syllabus presets only make sense for Class 11/12.
  useEffect(() => {
    if (!hasSeniorGrade && groupTestType !== "custom") setGroupTestType("custom");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSeniorGrade]);

  const toggleGrade = (grade: number) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade].sort((a, b) => a - b)
    );
  };

  const handleSubjectToggle = (subject: string) => {
    setSelectedSubjects((prev) =>
      prev.includes(subject) ? prev.filter((s) => s !== subject) : [...prev, subject]
    );
    // Reset chapter selection when subjects change
    setSelectedChapters((prev) => prev.filter((ch) => {
      if (selectedSubjects.includes(subject)) {
        return ch.subject !== subject;
      }
      return true;
    }));
  };

  const handleChapterToggle = (subject: string, chapter: string) => {
    setSelectedChapters((prev) => {
      const exists = prev.some((ch) => ch.subject === subject && ch.chapter === chapter);
      return exists
        ? prev.filter((ch) => !(ch.subject === subject && ch.chapter === chapter))
        : [...prev, { subject, chapter }];
    });
  };

  const availableChapters = selectedSubjects.flatMap((s) =>
    (chapters[s] || []).map((ch) => ({ subject: s, chapter: ch }))
  );

  const handleCreate = async () => {
    if (!user) return;
    if (selectedGrades.length === 0) {
      toast.error("Pehle class select karo (e.g. Class 11)");
      return;
    }
    if (groupTestType === "custom" && selectedChapters.length === 0 && selectedSubjects.length === 0) {
      toast.error("Please select at least one subject or chapter");
      return;
    }

    setLoading(true);
    try {
      let questionIds: string[] = [];

      if (groupTestType === "custom") {
        const examValues = TRACK_EXAM_VALUES[track];
        const examOr = `${examValues.map((v) => `exam.eq."${v}"`).join(",")},exam.is.null`;

        // Class scoping happens through chapters, since questions carry no grade column.
        const selectedChapterNames = new Set(selectedChapters.map((ch) => ch.chapter));
        const scopedRows = selectedChapters.length > 0
          ? chapterRows.filter((c) => selectedChapterNames.has(c.chapter_name))
          : chapterRows.filter((c) => selectedSubjects.includes(c.subject));
        const scopedChapterIds = scopedRows.map((c) => c.id);
        const scopedChapterNames = Array.from(new Set(scopedRows.map((c) => c.chapter_name)));

        let query = supabase
          .from("questions_public")
          .select("id")
          .or('is_active.is.null,is_active.eq.true')
          .or(examOr);

        if (scopedChapterIds.length > 0) {
          query = query.in("chapter_id", scopedChapterIds);
        } else if (scopedChapterNames.length > 0) {
          query = query.in("chapter", scopedChapterNames);
        } else if (selectedSubjects.length > 0) {
          query = query.in("subject", Array.from(new Set(selectedSubjects.flatMap((subject) => getSubjectAliases(subject)))));
        }

        let { data: questions, error } = await query.limit(Math.max(300, questionCount * 4));
        if (error) throw error;

        // Fallback: some rows are linked by chapter name only, not chapter_id.
        if ((!questions || questions.length === 0) && scopedChapterNames.length > 0) {
          const retry = await supabase
            .from("questions_public")
            .select("id")
            .or('is_active.is.null,is_active.eq.true')
            .or(examOr)
            .in("chapter", scopedChapterNames)
            .limit(Math.max(300, questionCount * 4));
          if (retry.error) throw retry.error;
          questions = retry.data;
        }

        if (!questions || questions.length === 0) {
          toast.error(
            `Class ${selectedGrades.join(", ")} ${track} ke selected chapters mein abhi questions nahi hain. Doosra chapter ya subject try karo.`
          );
          setLoading(false);
          return;
        }

        const shuffled = questions.sort(() => Math.random() - 0.5);
        questionIds = shuffled
          .slice(0, Math.min(questionCount, questions.length))
          .map((q) => q.id);

        if (questionIds.length < questionCount) {
          toast.info(`Only ${questionIds.length} questions available — test created with these.`);
        }
      } else {
        const preset = GROUP_TEST_PRESETS[groupTestType];

        const pattern = getExamPattern(preset.patternName);
        const selectedBySubject: string[] = [];

        for (const subject of pattern.subjects) {
          const perSubjectConfig = pattern.subjectConfig[subject];

          const { data: subjectQuestions, error: subjectError } = await supabase
            .from("questions_public")
            .select("id")
            .in("exam", preset.examAliases)
            .eq("subject", subject)
            .or('is_active.is.null,is_active.eq.true')
            .limit(perSubjectConfig.questionsPerSubject * 3);

          if (subjectError) throw subjectError;

          const shuffledSubject = (subjectQuestions || []).sort(() => Math.random() - 0.5);
          const picked = shuffledSubject.slice(0, perSubjectConfig.questionsPerSubject).map((q) => q.id);
          selectedBySubject.push(...picked);
        }

        if (selectedBySubject.length === 0) {
          toast.error("No questions available for selected full syllabus pattern");
          setLoading(false);
          return;
        }

        questionIds = selectedBySubject;

        if (questionIds.length < pattern.totalQuestions) {
          toast.info(`Only ${questionIds.length} questions available for ${pattern.name}. Test will start with available questions.`);
        }
      }

      const code = generateTestCode();
      const testTitle =
        title.trim() ||
        (groupTestType === "custom"
          ? (selectedChapters.length > 0
              ? `${selectedChapters.map((ch) => ch.chapter).join(", ")} - Group Test`
              : `${selectedSubjects.join(", ")} - Group Test`)
          : `${GROUP_TEST_PRESETS[groupTestType].label} - Group Test`);

      const expiresAt = expiryHours ? new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString() : null;

      const { data: insertData, error: insertError } = await supabase.from("group_tests").insert({
        code,
        test_code: code,
        title: testTitle,
        question_ids: questionIds,
        duration_minutes: duration,
        host_id: user.id,
        created_by: user.id,
        subject: selectedSubjects[0] || null,
        chapter_names: selectedChapters.map((ch) => ch.chapter),
        ends_at: expiresAt,
      }).select("id").single();

      if (insertError) {
        if (insertError.code === "23505") {
          const code2 = generateTestCode();
          const { data: retryData, error: retryError } = await supabase.from("group_tests").insert({
            code: code2,
            test_code: code2,
            title: testTitle,
            question_ids: questionIds,
            duration_minutes: duration,
            host_id: user.id,
            created_by: user.id,
            subject: selectedSubjects[0] || null,
            chapter_names: selectedChapters.map((ch) => ch.chapter),
            ends_at: expiresAt,
          }).select("id").single();
          if (retryError) throw retryError;
          setTestCode(code2);
          setTestId(retryData.id);
          setQrSvg(generateQRCodeSVG(`${APP_URL}/group-test/join?code=${code2}`));
        } else {
          throw insertError;
        }
      } else {
        setTestCode(code);
        setTestId(insertData.id);
        setQrSvg(generateQRCodeSVG(`${APP_URL}/group-test/join?code=${code}`));
      }

      setStep("share");
      toast.success("Group test created!");
    } catch (err) {
      logger.error("Failed to create group test:", err);
      const msg = (err as { message?: string })?.message;
      toast.error(msg ? `Failed to create group test: ${msg}` : "Failed to create group test");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(testCode);
    setCopied(true);
    toast.success("Code copied!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleWhatsAppShare = () => {
    const msg = `Join my test on *JEEnie AI*!\n\nCode: *${testCode}*\n${APP_URL}/group-test/join?code=${testCode}\n\nOpen the app and enter this code to start!`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const handleDeactivate = async () => {
    if (!testId || !confirm("Are you sure? This will permanently deactivate the test code.")) return;
    setDeactivating(true);
    try {
      const { error } = await supabase
        .from("group_tests")
        .update({ is_active: false })
        .eq("id", testId);
      if (error) throw error;
      toast.success("Group test deactivated");
      navigate("/tests");
    } catch (err) {
      logger.error("Failed to deactivate group test:", err);
      toast.error("Failed to deactivate");
    } finally {
      setDeactivating(false);
    }
  };

  if (step === "share") {
    return (
      <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
        <Header />
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
          <div className="max-w-lg mx-auto">
            <Card className="border-2 border-primary/20 shadow-xl">
              <CardHeader className="text-center bg-linear-to-br from-primary/5 to-secondary pb-6">
                <div className="w-16 h-16 bg-linear-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-xl font-bold">Group Test Created! 🎉</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Share this code with your friends</p>
                {expiryHours && (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    ⏰ Expires in {expiryHours >= 24 ? `${expiryHours / 24} day${expiryHours > 24 ? 's' : ''}` : `${expiryHours} hour${expiryHours > 1 ? 's' : ''}`}
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="space-y-6 pt-6">
                {/* Code display */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-medium">Test Code</p>
                  <div
                    className="text-4xl font-mono font-bold tracking-[0.3em] text-primary bg-secondary rounded-2xl py-4 px-6 cursor-pointer hover:bg-secondary/80 transition-colors"
                    onClick={handleCopyCode}
                  >
                    {testCode}
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleCopyCode} className="mt-2 text-xs">
                    {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                    {copied ? "Copied!" : "Copy Code"}
                  </Button>
                </div>

                {/* QR Code */}
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-3 uppercase tracking-wider font-medium">Or Scan QR Code</p>
                  <div
                    className="inline-block bg-white p-4 rounded-2xl shadow-md border"
                    dangerouslySetInnerHTML={{ __html: qrSvg }}
                    style={{ width: 200, height: 200 }}
                  />
                </div>

                {/* Share buttons */}
                <div className="space-y-3">
                  <Button
                    className="w-full bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleWhatsAppShare}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Share on WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `🎯 Join my test on JEEnie AI!\nCode: ${testCode}\n${APP_URL}/group-test/join?code=${testCode}`
                      );
                      toast.success("Share link copied!");
                    }}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Copy Share Link
                  </Button>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => navigate("/tests")}>
                    Back to Tests
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => navigate(`/group-test/join?code=${testCode}`)}
                  >
                    Take Test Yourself
                  </Button>
                </div>

                {/* Deactivate */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 text-xs"
                  onClick={handleDeactivate}
                  disabled={deactivating}
                >
                  <XCircle className="w-3 h-3 mr-1" />
                  {deactivating ? "Deactivating..." : "Deactivate This Test"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  return (
      <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <Button variant="outline" className="mb-4" onClick={() => navigate("/tests")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tests
          </Button>

          <Card className="border-2 border-primary/20 shadow-lg">
            <CardHeader className="bg-linear-to-r from-primary/10 to-secondary border-b">
              <CardTitle className="flex items-center gap-3 text-lg">
                <div className="w-10 h-10 bg-linear-to-br from-primary to-blue-600 rounded-xl flex items-center justify-center">
                  <Users className="w-5 h-5 text-white" />
                </div>
                Create Group Test
              </CardTitle>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                
                Create a test and share with friends — everyone gets the same questions!
              </p>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-6">
              {/* Title */}
              <div>
                <Label className="text-sm font-medium">Test Title (optional)</Label>
                <Input
                  placeholder="e.g., Physics Chapter 3 Challenge"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1"
                />
              </div>

              {/* Class + track picker — a teacher can build a test for ANY class */}
              <div>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-bold">1</div>
                  Which class is this test for?
                </h3>
                <div className="flex flex-wrap gap-2">
                  {ALL_GRADES.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => toggleGrade(g)}
                      className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                        selectedGrades.includes(g)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      Class {g}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Aap kisi bhi class ka test bana sakte ho — apni class se bandhe nahi ho.
                </p>

                <div className="mt-4">
                  <Label className="text-sm font-medium">Track</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {(hasSeniorGrade
                      ? (["JEE", "NEET", "MHT-CET", ...(hasJuniorGrade ? ["Foundation"] : [])] as Track[])
                      : (["Foundation"] as Track[])
                    ).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTrack(t)}
                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-all ${
                          track === t
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {selectedGrades.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 text-sm text-muted-foreground">
                  Class select karte hi subjects aur chapters yahin dikh jayenge.
                </div>
              ) : (
              <>
              {/* Group test type */}
              <div>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-bold">2</div>
                  Select Group Test Type
                </h3>
                <div className={`grid grid-cols-1 gap-3 ${hasSeniorGrade ? "sm:grid-cols-4" : "sm:grid-cols-1"}`}>

                  <div
                    className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${
                      groupTestType === "custom" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setGroupTestType("custom")}
                  >
                    <div className="font-semibold text-sm">Custom (Subject/Chapter)</div>
                    <div className="text-xs text-muted-foreground mt-1">Your own mix of chapters and duration</div>
                  </div>
                  {hasSeniorGrade && (
                  <>
                  <div
                    className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${
                      groupTestType === "jee_mains_full" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setGroupTestType("jee_mains_full")}
                  >
                    <div className="font-semibold text-sm">JEE Mains Full Syllabus</div>
                    <div className="text-xs text-muted-foreground mt-1">Actual pattern, full paper simulation</div>
                  </div>
                  <div
                    className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${
                      groupTestType === "neet_full" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setGroupTestType("neet_full")}
                  >
                    <div className="font-semibold text-sm">NEET Full Syllabus</div>
                    <div className="text-xs text-muted-foreground mt-1">Actual pattern, full paper simulation</div>
                  </div>
                  <div
                    className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${
                      groupTestType === "mht_cet_full" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setGroupTestType("mht_cet_full")}
                  >
                    <div className="font-semibold text-sm">MHT-CET Full Syllabus</div>
                    <div className="text-xs text-muted-foreground mt-1">Actual CET pattern, full paper simulation</div>
                  </div>
                  </>
                  )}

                </div>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Questions</Label>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    className="mt-1"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                    disabled={groupTestType !== "custom"}
                  />
                  {groupTestType === "custom" && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[10, 15, 25, 30, 50, 75, 100].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setQuestionCount(n)}
                          className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                            questionCount === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium">Duration (min)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={360}
                    className="mt-1"
                    value={duration}
                    onChange={(e) => setDuration(Math.max(1, Math.min(360, Number(e.target.value) || 1)))}
                    disabled={groupTestType !== "custom"}
                  />
                  {groupTestType === "custom" && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {[15, 30, 45, 60, 90, 120, 180].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setDuration(n)}
                          className={`px-2 py-0.5 rounded-full border text-[11px] transition-colors ${
                            duration === n ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {n}m
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-sm font-medium">Expiry</Label>
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={expiryHours ?? "none"}
                    onChange={(e) => setExpiryHours(e.target.value === "none" ? null : Number(e.target.value))}
                  >
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                    <option value="none">No Expiry</option>
                  </select>
                </div>
              </div>

              {groupTestType !== "custom" && (
                <div className="p-3 rounded-lg border border-primary/20 bg-primary/5">
                  <p className="text-sm font-medium text-primary">
                    {GROUP_TEST_PRESETS[groupTestType].description}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Questions and duration are auto-set to match actual exam pattern.
                  </p>
                </div>
              )}

              {/* Subject Selection */}
              {groupTestType === "custom" && (
              <div>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-bold">2</div>
                  Select Subjects
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {subjects.map((subject) => (
                    <div
                      key={subject}
                      className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${
                        selectedSubjects.includes(subject)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => handleSubjectToggle(subject)}
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox checked={selectedSubjects.includes(subject)} />
                        <div>
                          <div className="font-semibold text-sm">{subject}</div>
                          <div className="text-xs text-muted-foreground">
                            {chapters[subject]?.length || 0} chapters
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              )}

              {/* Chapter Selection */}
              {groupTestType === "custom" && availableChapters.length > 0 && (
                <div>
                  <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-purple-600 flex items-center justify-center text-white text-xs font-bold">3</div>
                    Select Chapters
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {selectedChapters.length} selected
                    </Badge>
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
                    {availableChapters.map(({ subject, chapter }) => (
                      <div
                        key={`${subject}-${chapter}`}
                        className={`p-2.5 border-2 rounded-lg cursor-pointer transition-all text-sm ${
                          selectedChapters.some(
                            (ch) => ch.subject === subject && ch.chapter === chapter
                          )
                            ? "border-purple-500 bg-purple-50"
                            : "border-border hover:border-purple-300"
                        }`}
                        onClick={() => handleChapterToggle(subject, chapter)}
                      >
                        <div className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedChapters.some(
                              (ch) => ch.subject === subject && ch.chapter === chapter
                            )}
                            className="shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{chapter}</div>
                            <Badge variant="outline" className="text-[10px]">{subject}</Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                className="w-full bg-linear-to-r from-primary to-blue-600 text-white font-semibold py-3 rounded-xl"
                onClick={handleCreate}
                disabled={loading || (groupTestType === "custom" && selectedSubjects.length === 0 && selectedChapters.length === 0)}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </span>
                ) : (
                  <>
                    <QrCode className="w-4 h-4 mr-2" />
                    Create & Get Share Code
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CreateGroupTestPage;
