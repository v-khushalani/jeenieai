import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, ArrowLeft, Play, Clock, FileText, Loader2, AlertTriangle, QrCode, X } from "lucide-react";
import { logger } from "@/utils/logger";
import { formatSubjectDisplay } from '@/utils/subjectDisplay';
import { UserLimitsService } from "@/services/userLimitsService";
import { testsAPI } from "@/services/api";

import safeLocalStorage from '@/utils/safeStorage';
interface GroupTest {
  id: string;
  test_code: string;
  title: string;
  question_ids: string[];
  duration_minutes: number;
  subject: string | null;
  chapter_names: string[];
  expires_at: string | null;
}

const JoinGroupTestPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated, isPremium } = useAuth();

  const [code, setCode] = useState(searchParams.get("code") || "");
  const [loading, setLoading] = useState(false);
  const [groupTest, setGroupTest] = useState<GroupTest | null>(null);
  const [joining, setJoining] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(false);
  const [scannerStarting, setScannerStarting] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [quotaChecked, setQuotaChecked] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const scanTimerRef = React.useRef<number | null>(null);

  const stopScanner = React.useCallback(() => {
    if (scanTimerRef.current) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    setScannerSupported(typeof (window as any).BarcodeDetector !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // Auto-lookup if code is in URL
  useEffect(() => {
    const urlCode = searchParams.get("code");
    if (urlCode && urlCode.length === 6) {
      setCode(urlCode.toUpperCase());
      lookupCode(urlCode.toUpperCase());
    }
  }, [searchParams]);

  useEffect(() => {
    if (!showScanner) {
      stopScanner();
    }
    return () => stopScanner();
  }, [showScanner, stopScanner]);

  useEffect(() => {
    let cancelled = false;

    const precheckQuota = async () => {
      if (!isAuthenticated || !user?.id || isPremium) {
        if (!cancelled) setQuotaChecked(true);
        return;
      }

      try {
        await UserLimitsService.canStartTest(user.id);
      } finally {
        if (!cancelled) setQuotaChecked(true);
      }
    };

    setQuotaChecked(false);
    precheckQuota();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user?.id, isPremium]);

  const extractCode = React.useCallback((raw: string): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();

    try {
      const url = new URL(trimmed);
      const fromQuery = url.searchParams.get("code");
      if (fromQuery && /^[A-Za-z0-9]{6}$/.test(fromQuery)) {
        return fromQuery.toUpperCase();
      }
    } catch {
      // Not a URL, continue with regex checks.
    }

    const match = trimmed.match(/[A-Za-z0-9]{6}/);
    return match ? match[0].toUpperCase() : null;
  }, []);

  const startScanner = async () => {
    if (!scannerSupported || !videoRef.current) return;
    setScannerStarting(true);
    setScannerError(null);
    stopScanner();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const Detector = (window as any).BarcodeDetector;
      const detector = new Detector({ formats: ["qr_code"] });

      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (!codes?.length) return;

          const raw = codes[0]?.rawValue || "";
          const parsedCode = extractCode(raw);
          if (!parsedCode) return;

          setCode(parsedCode);
          setShowScanner(false);
          stopScanner();
          lookupCode(parsedCode);
          toast.success("QR scanned successfully");
        } catch {
          // keep scanning
        }
      }, 350);
    } catch (err) {
      logger.error("QR scanner start failed:", err);
      setScannerError("Unable to access camera. Please allow permission and try again.");
    } finally {
      setScannerStarting(false);
    }
  };

  const lookupCode = async (testCode: string) => {
    if (testCode.length !== 6) {
      toast.error("Code must be 6 characters");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("group_tests")
        .select("*")
        .eq("test_code", testCode.toUpperCase())
        .eq("is_active", true)
        .single();

      if (error || !data) {
        toast.error("Invalid or expired test code");
        setGroupTest(null);
        setLoading(false);
        return;
      }

      setGroupTest({
        id: data.id,
        test_code: data.test_code,
        title: data.title,
        question_ids: data.question_ids as string[],
        duration_minutes: data.duration_minutes,
        subject: data.subject,
        chapter_names: (data.chapter_names as string[]) || [],
        expires_at: (data as any).expires_at || null,
      });
    } catch (err) {
      logger.error("Error looking up group test:", err);
      toast.error("Failed to look up test code");
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!user || !groupTest) return;

    if (!isAuthenticated) {
      toast.error("Please login first");
      navigate("/login");
      return;
    }

    if (!isPremium && !quotaChecked) {
      toast.info('Checking your free test quota. Please wait a moment.');
      return;
    }

    const testAccess = await UserLimitsService.canStartTest(user.id);
    if (!testAccess.canStart) {
      toast.error(`You've used all ${testAccess.testsLimit} free tests this month. Upgrade for unlimited tests.`);
      navigate("/subscription-plans");
      return;
    }

    setJoining(true);
    try {
      // Fetch full question data using question_ids (excluding inactive/reported questions)
      const questionIds = groupTest.question_ids;
      
      const { data: questions, error } = await supabase
        .from("questions_public")
        .select("*")
        .in("id", questionIds)
        .or('is_active.is.null,is_active.eq.true');

      if (error) throw error;

      if (!questions || questions.length === 0) {
        toast.error("Questions no longer available for this test");
        setJoining(false);
        return;
      }

      // Preserve original order from question_ids
      const orderedQuestions = questionIds
        .map((id) => questions.find((q) => q.id === id))
        .filter(Boolean);

      const reservation = await testsAPI.reserveTestSessionLegacy(
          user.id,
          formatSubjectDisplay(groupTest.subject, groupTest.title),
          orderedQuestions.length,
          groupTest.title,
          questionIds,
          groupTest.id,
      );

      if (reservation.error || !reservation.data?.id) {
        throw new Error(reservation.error?.message || 'Failed to reserve test session');
      }

      const testSession = {
        id: Date.now().toString(),
        title: groupTest.title,
        questions: orderedQuestions,
        duration: groupTest.duration_minutes,
        startTime: new Date().toISOString(),
        groupTestId: groupTest.id,
        groupTestCode: groupTest.test_code,
        sessionId: reservation.data.id,
      };

      safeLocalStorage.setItem("currentTest", JSON.stringify(testSession));
      UserLimitsService.recordMonthlyTestUsage(user.id);

      toast.success(`Joining "${groupTest.title}" with ${orderedQuestions.length} questions!`);
      navigate("/test-attempt", { state: { currentTest: testSession } });
    } catch (err) {
      logger.error("Failed to join group test:", err);
      toast.error("Failed to load test questions");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="max-w-lg mx-auto">
          <Button variant="outline" className="mb-4" onClick={() => navigate("/tests")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tests
          </Button>

          <Card className="border-2 border-primary/20 shadow-lg">
            <CardHeader className="text-center bg-linear-to-br from-primary/5 to-secondary border-b">
              <div className="w-14 h-14 bg-linear-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Users className="w-7 h-7 text-white" />
              </div>
              <CardTitle className="text-xl">Join Group Test</CardTitle>
              <p className="text-sm text-muted-foreground">Enter the 6-character code shared by your friend</p>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Code Input */}
              <div>
                <Input
                  placeholder="Enter 6-digit code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
                  className="text-center text-2xl font-mono tracking-[0.3em] h-14 border-2"
                  maxLength={6}
                  autoFocus
                />
                <Button
                  className="w-full mt-3"
                  onClick={() => lookupCode(code)}
                  disabled={code.length !== 6 || loading}
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : null}
                  {loading ? "Looking up..." : "Find Test"}
                </Button>
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => {
                    if (!scannerSupported) {
                      toast.error("QR scanner is not supported on this device/browser.");
                      return;
                    }
                    setShowScanner(true);
                    setTimeout(() => {
                      startScanner();
                    }, 0);
                  }}
                >
                  <QrCode className="w-4 h-4 mr-2" />
                  Scan QR Code
                </Button>
              </div>

              {/* Test Preview */}
              {groupTest && (() => {
                const isExpired = groupTest.expires_at && new Date(groupTest.expires_at) < new Date();
                return (
                  <div className={`border-2 rounded-xl p-4 space-y-4 ${isExpired ? "border-destructive/30 bg-destructive/5" : "border-primary/20 bg-primary/5"}`}>
                    <div>
                      <h3 className="font-bold text-lg">{groupTest.title}</h3>
                      {groupTest.chapter_names.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {groupTest.chapter_names.map((ch) => (
                            <Badge key={ch} variant="secondary" className="text-xs">
                              {ch}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {groupTest.question_ids.length} Questions
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {groupTest.duration_minutes} min
                      </div>
                      {groupTest.expires_at && (
                        <Badge variant={isExpired ? "destructive" : "secondary"} className="text-xs">
                          {isExpired ? "Expired" : `Expires ${new Date(groupTest.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                        </Badge>
                      )}
                    </div>

                    {isExpired ? (
                      <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        This test has expired and can no longer be taken.
                      </div>
                    ) : (
                      <Button
                        className="w-full bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold py-3 rounded-xl"
                        onClick={handleJoin}
                        disabled={joining || (!isPremium && !quotaChecked)}
                      >
                        {joining ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="w-4 h-4 mr-2" />
                        )}
                        {joining ? "Loading Questions..." : "Start Test"}
                      </Button>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      </div>

      {showScanner && (
        <div className="fixed inset-0 z-50 bg-black/75 p-4 flex items-center justify-center" onClick={() => setShowScanner(false)}>
          <Card className="w-full max-w-md bg-background" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Scan Group Test QR</CardTitle>
                <Button size="icon" variant="ghost" onClick={() => setShowScanner(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-lg overflow-hidden border bg-black">
                <video ref={videoRef} className="w-full aspect-square object-cover" playsInline muted autoPlay />
              </div>
              {scannerStarting && <p className="text-xs text-muted-foreground">Starting camera...</p>}
              {scannerError && <p className="text-xs text-destructive">{scannerError}</p>}
              <p className="text-xs text-muted-foreground">Point your camera at the QR code. Code will be detected automatically.</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default JoinGroupTestPage;
