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
  ArrowLeft, Users, Share2, Copy, Check, MessageCircle, QrCode, Sparkles, XCircle
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

const CreateGroupTestPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Setup state
  const [step, setStep] = useState<"setup" | "share">("setup");
  const [subjects, setSubjects] = useState<string[]>([]);
  const [chapters, setChapters] = useState<Record<string, string[]>>({});
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

  const loadProfile = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("my_profile" as any).select("*").maybeSingle();
    setProfile(data);
  }, [user]);

  const fetchSubjectsAndChapters = useCallback(async () => {
    if (!user || !profile) return;
    const targetExam = profile.target_exam || "JEE";
    const userGrade = parseGrade(profile.grade || 12);
    const batch = await getBatchForStudent(user.id, userGrade, targetExam);
    const examSubjects = getAllowedSubjects(targetExam);
    const subjectsToShow = batch?.subjects?.length
      ? getFilteredSubjects(targetExam, batch.subjects)
      : examSubjects;

    let query = supabase
      .from("chapters")
      .select("id, subject, chapter_name, chapter_number, batch_id")
      .in("subject", subjectsToShow)
      .order("chapter_number");
    if (batch?.id) query = query.eq("batch_id", batch.id);
    const { data: chaptersData } = await query;

    const bySubject: Record<string, string[]> = {};
    subjectsToShow.forEach((s) => {
      bySubject[s] = chaptersData?.filter((c) => c.subject === s).map((c) => c.chapter_name) || [];
    });
    setSubjects(subjectsToShow);
    setChapters(bySubject);
  }, [user, profile]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (profile) fetchSubjectsAndChapters();
  }, [profile, fetchSubjectsAndChapters]);

  useEffect(() => {
    if (groupTestType === "custom") return;

    const preset = GROUP_TEST_PRESETS[groupTestType];
    const pattern = getExamPattern(preset.patternName);
    setQuestionCount(pattern.totalQuestions);
    setDuration(pattern.duration);
    setSelectedSubjects([]);
    setSelectedChapters([]);
  }, [groupTestType]);

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
    if (groupTestType === "custom" && selectedChapters.length === 0 && selectedSubjects.length === 0) {
      toast.error("Please select at least one subject or chapter");
      return;
    }

    setLoading(true);
    try {
      const targetExam = profile?.target_exam || "JEE";
      const userGrade = parseGrade(profile?.grade || 12);
      const batch = await getBatchForStudent(user.id, userGrade, targetExam);

      let questionIds: string[] = [];

      if (groupTestType === "custom") {
        let query = supabase
          .from("questions_public")
          .select("id")
          .or('is_active.is.null,is_active.eq.true')
          .in('exam', mapBatchToExamValues(targetExam));
        if (batch?.id) query = query.or(`batch_id.eq.${batch.id},batch_id.is.null`);

        if (selectedChapters.length > 0) {
          query = query.in("chapter", selectedChapters.map((ch) => ch.chapter));
        } else if (selectedSubjects.length > 0) {
          query = query.in("subject", Array.from(new Set(selectedSubjects.flatMap((subject) => getSubjectAliases(subject)))));
        }

        const { data: questions, error } = await query.limit(300);
        if (error) throw error;

        if (!questions || questions.length === 0) {
          toast.error("No questions available for the selected chapters");
          setLoading(false);
          return;
        }

        const shuffled = questions.sort(() => Math.random() - 0.5);
        questionIds = shuffled
          .slice(0, Math.min(questionCount, questions.length))
          .map((q) => q.id);
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
      toast.error("Failed to create group test");
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
                <Sparkles className="w-3 h-3" />
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

              {/* Group test type */}
              <div>
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-primary flex items-center justify-center text-white text-xs font-bold">1</div>
                  Select Group Test Type
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div
                    className={`p-3 border-2 rounded-xl cursor-pointer transition-all ${
                      groupTestType === "custom" ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                    }`}
                    onClick={() => setGroupTestType("custom")}
                  >
                    <div className="font-semibold text-sm">Custom (Subject/Chapter)</div>
                    <div className="text-xs text-muted-foreground mt-1">Your own mix of chapters and duration</div>
                  </div>
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
                </div>
              </div>

              {/* Settings */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Questions</Label>
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                    disabled={groupTestType !== "custom"}
                  >
                    <option value={10}>10 Questions</option>
                    <option value={15}>15 Questions</option>
                    <option value={25}>25 Questions</option>
                    <option value={50}>50 Questions</option>
                  </select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Duration</Label>
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    disabled={groupTestType !== "custom"}
                  >
                    <option value={15}>15 min</option>
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                    <option value={90}>90 min</option>
                    <option value={120}>120 min</option>
                  </select>
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
