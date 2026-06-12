import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import LoadingScreen from '@/components/ui/LoadingScreen';
import Header from "@/components/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Trophy, Users, Clock, Target, Share2, MessageCircle, Loader2, Wifi } from "lucide-react";
import { logger } from "@/utils/logger";

interface LeaderboardEntry {
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  score: number;
  total_questions: number;
  correct_answers: number;
  accuracy: number;
  time_taken: number;
  completed_at: string;
}

const APP_URL = window.location.origin;

const GroupTestLeaderboard = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [testTitle, setTestTitle] = useState("");
  const [testCode, setTestCode] = useState(code || "");
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [groupTestId, setGroupTestId] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      // Get group test info
      const { data: groupTest, error: gtError } = await supabase
        .from("group_tests")
        .select("id, title, test_code")
        .eq("test_code", code!.toUpperCase())
        .single();

      if (gtError || !groupTest) {
        toast.error("Group test not found");
        setLoading(false);
        return;
      }

      setTestTitle(groupTest.title);
      setTestCode(groupTest.test_code);
      setExpiresAt((groupTest as any).expires_at || null);
      setGroupTestId(groupTest.id);

      // Get all test sessions for this group test
      const { data: sessions, error: sessError } = await supabase
        .from("test_sessions")
        .select("user_id, score, total_questions, correct_answers, accuracy, time_taken, completed_at")
        .eq("group_test_id", groupTest.id)
        .eq("status", "completed")
        .order("score", { ascending: false })
        .order("time_taken", { ascending: true });

      if (sessError) throw sessError;

      if (!sessions || sessions.length === 0) {
        setEntries([]);
        setLoading(false);
        return;
      }

      // Get profile info for all participants
      const userIds = [...new Set(sessions.map((s) => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const leaderboard: LeaderboardEntry[] = sessions.map((s) => {
        const profile = profileMap.get(s.user_id);
        return {
          user_id: s.user_id,
          full_name: profile?.full_name || "Student",
          avatar_url: profile?.avatar_url || null,
          score: s.score || 0,
          total_questions: s.total_questions || 0,
          correct_answers: s.correct_answers || 0,
          accuracy: s.accuracy || 0,
          time_taken: s.time_taken || 0,
          completed_at: s.completed_at || "",
        };
      });

      setEntries(leaderboard);
    } catch (err) {
      logger.error("Failed to fetch leaderboard:", err);
      toast.error("Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    if (code) fetchLeaderboard();
  }, [code, fetchLeaderboard]);

  // Real-time subscription for live leaderboard updates
  useEffect(() => {
    if (!groupTestId) return;

    const channel = supabase
      .channel(`group-test-leaderboard-${groupTestId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "test_sessions",
          filter: `group_test_id=eq.${groupTestId}`,
        },
        () => {
          // Refetch leaderboard on any change
          fetchLeaderboard();
        }
      )
      .subscribe((status) => {
        setIsLive(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [groupTestId, fetchLeaderboard]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return "🥇";
    if (index === 1) return "🥈";
    if (index === 2) return "🥉";
    return `#${index + 1}`;
  };

  const handleWhatsAppShare = () => {
    const msg = `*Group Test Leaderboard*\n\n*${testTitle}*\n\n${entries
      .slice(0, 5)
      .map((e, i) => `${getRankBadge(i)} ${e.full_name} -- ${e.correct_answers * 4}/${e.total_questions * 4} (${e.accuracy.toFixed(0)}%)`)
      .join("\n")}\n\nJoin: ${APP_URL}/group-test/join?code=${testCode}`;
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <Button variant="outline" className="mb-4" onClick={() => navigate("/tests")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Tests
          </Button>

          <Card className="border-2 border-primary/20 shadow-lg mb-6">
            <CardHeader className="text-center bg-linear-to-br from-primary/5 to-secondary border-b pb-6">
              <div className="w-14 h-14 bg-linear-to-br from-yellow-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto mb-3">
                <Trophy className="w-7 h-7 text-white" />
              </div>
              <CardTitle className="text-xl flex items-center justify-center gap-2">
                Group Leaderboard
                {isLive && (
                  <Badge variant="outline" className="text-[10px] border-green-500 text-green-600 animate-pulse">
                    <Wifi className="w-3 h-3 mr-1" /> LIVE
                  </Badge>
                )}
              </CardTitle>
              <p className="text-sm text-muted-foreground">{testTitle}</p>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                <Badge variant="secondary" className="font-mono tracking-wider">
                  Code: {testCode}
                </Badge>
                {expiresAt && (
                  <Badge variant={new Date(expiresAt) < new Date() ? "destructive" : "outline"} className="text-xs">
                    {new Date(expiresAt) < new Date() ? "Expired" : `Expires ${new Date(expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-4 sm:p-6">
              {loading ? (
                <LoadingScreen pageName="Group Test Leaderboard" message="Loading leaderboard..." />
              ) : entries.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
                  <p className="text-muted-foreground font-medium">No one has completed this test yet</p>
                  <p className="text-sm text-muted-foreground mt-1">Be the first!</p>
                  <div className="flex flex-col items-center gap-4 mt-6">
                    <div className="bg-indigo-900/40 p-2 rounded-lg backdrop-blur-xs shadow-inner flex flex-col items-center gap-2">
                      <span className="text-[10px] text-indigo-300 uppercase tracking-widest font-bold">Share Code</span>
                      <span className="text-3xl font-black text-white tracking-widest break-all">
                        {code}
                      </span>
                      <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=${encodeURIComponent(`${APP_URL}/group-test/join?code=${code}`)}&bgcolor=312e81&color=ffffff`} 
                        alt="QR Code" 
                        className="w-20 h-20 rounded shadow-md mt-1"
                      />
                    </div>
                    <Button
                      className="mt-4"
                      onClick={() => navigate(`/group-test/join?code=${testCode}`)}
                    >
                      Take This Test
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {entries.map((entry, index) => {
                    const isCurrentUser = entry.user_id === user?.id;
                    return (
                      <div
                        key={`${entry.user_id}-${index}`}
                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${
                          isCurrentUser
                            ? "border-primary bg-primary/5"
                            : index < 3
                            ? "border-yellow-200 bg-yellow-50/50"
                            : "border-border"
                        }`}
                      >
                        {/* Rank */}
                        <div className="text-2xl font-bold w-10 text-center shrink-0">
                          {getRankBadge(index)}
                        </div>

                        {/* Avatar */}
                        <Avatar className="w-10 h-10 shrink-0">
                          <AvatarImage src={entry.avatar_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold text-sm">
                            {entry.full_name?.charAt(0)?.toUpperCase() || "S"}
                          </AvatarFallback>
                        </Avatar>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate flex items-center gap-1">
                            {entry.full_name}
                            {isCurrentUser && (
                              <Badge variant="secondary" className="text-[10px] px-1.5">You</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1">
                              <Target className="w-3 h-3" />
                              {entry.accuracy.toFixed(0)}%
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatTime(entry.time_taken)}
                            </span>
                          </div>
                        </div>

                        {/* Score */}
                        <div className="text-right shrink-0">
                          <div className="font-bold text-lg text-primary">
                            {entry.correct_answers * 4 - (entry.total_questions - entry.correct_answers - (entry.total_questions - (entry.correct_answers + (entry.total_questions - entry.correct_answers)))) > 0 ? "+" : ""}
                            {entry.correct_answers * 4}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.correct_answers}/{entry.total_questions}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Share Button */}
              {entries.length > 0 && (
                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    className="flex-1 border-green-500 text-green-600 hover:bg-green-50"
                    onClick={handleWhatsAppShare}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Share on WhatsApp
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => navigate(`/group-test/join?code=${testCode}`)}
                  >
                    <Share2 className="w-4 h-4 mr-2" />
                    Take Test Again
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default GroupTestLeaderboard;
