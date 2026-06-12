import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import SEOHead from '@/components/SEOHead';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Carousel, CarouselContent, CarouselItem,
  CarouselNext, CarouselPrevious, type CarouselApi,
} from '@/components/ui/carousel';
import { Share2, Download } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import { supabase } from '@/integrations/supabase/client';
import ReferralService from '@/services/referralService';
import ShareCardDialog from '@/components/ShareCardDialog';
import type { WrappedSlideOpts } from '@/lib/shareCard';
import { logger } from '@/utils/logger';

type Period = 'month' | 'year';

interface WrappedData {
  totalQuestions: number;
  totalCorrect: number;
  accuracy: number;
  hoursStudied: number;
  daysActive: number;
  longestStreak: number;
  strongestTopic: string;
  weakestTopic: string;
  weakestAccuracy: number;
  totalTests: number;
  pointsEarned: number;
  rank: number | null;
  totalUsers: number;
}

const WrappedPage = () => {
  const { user } = useAuth();
  const shareCardEnabled = useFeatureFlag('share_card');
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSlide, setShareSlide] = useState<WrappedSlideOpts | null>(null);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    onSelect();
    api.on('select', onSelect);
    return () => { api.off('select', onSelect); };
  }, [api]);

  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const since = new Date();
        if (period === 'month') since.setDate(since.getDate() - 30);
        else since.setDate(since.getDate() - 365);
        const sinceIso = since.toISOString();

        const [attemptsRes, profileRes, testsRes, pointsRes, lbRes] = await Promise.all([
          supabase
            .from('question_attempts')
            .select('is_correct, time_spent, question_id, created_at')
            .eq('user_id', user.id)
            .gte('created_at', sinceIso)
            .limit(10000),
          supabase
            .from('profiles')
            .select('longest_streak, total_points')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('test_sessions')
            .select('id')
            .eq('user_id', user.id)
            .gte('created_at', sinceIso),
          supabase
            .from('points_log')
            .select('points')
            .eq('user_id', user.id)
            .gte('created_at', sinceIso)
            .limit(5000),
          supabase.rpc('get_leaderboard_with_stats', { limit_count: 1000 }).then(r => r.data, () => null),
        ]);

        const attempts = attemptsRes.data || [];
        const totalQ = attempts.length;
        const correct = attempts.filter(a => a.is_correct).length;
        const accuracy = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;
        const seconds = attempts.reduce((s, a) => s + (a.time_spent || 0), 0);
        const hours = Math.round((seconds / 3600) * 10) / 10;
        const days = new Set(attempts.map(a => (a.created_at || '').slice(0, 10))).size;

        // Topic mastery
        const qIds = [...new Set(attempts.map(a => a.question_id))].slice(0, 2000);
        const qMeta: Record<string, { topic: string | null }> = {};
        for (let i = 0; i < qIds.length; i += 500) {
          const chunk = qIds.slice(i, i + 500);
          const { data: qData } = await supabase
            .from('questions_public' as any)
            .select('id, topic')
            .in('id', chunk);
          (qData || []).forEach((q: any) => { qMeta[q.id] = { topic: q.topic }; });
        }
        const topicMap: Record<string, { c: number; t: number }> = {};
        attempts.forEach(a => {
          const t = qMeta[a.question_id]?.topic;
          if (!t) return;
          if (!topicMap[t]) topicMap[t] = { c: 0, t: 0 };
          topicMap[t].t++;
          if (a.is_correct) topicMap[t].c++;
        });
        let strongest = 'Keep practicing!';
        let weakest = 'Keep practicing!';
        let weakAcc = 100;
        let strongAcc = 0;
        Object.entries(topicMap).forEach(([t, s]) => {
          if (s.t >= 5) {
            const a = (s.c / s.t) * 100;
            if (a < weakAcc) { weakAcc = a; weakest = t; }
            if (a > strongAcc) { strongAcc = a; strongest = t; }
          }
        });

        const pts = (pointsRes.data || []).reduce((s, r: any) => s + (r.points || 0), 0);
        const lb = Array.isArray(lbRes) ? lbRes : [];
        const idx = lb.findIndex((p: any) => p.id === user.id);
        const rank = idx >= 0 ? idx + 1 : null;

        setData({
          totalQuestions: totalQ,
          totalCorrect: correct,
          accuracy,
          hoursStudied: hours,
          daysActive: days,
          longestStreak: profileRes.data?.longest_streak || 0,
          strongestTopic: strongest,
          weakestTopic: weakest,
          weakestAccuracy: Math.round(weakAcc === 100 ? 0 : weakAcc),
          totalTests: (testsRes.data || []).length,
          pointsEarned: pts,
          rank,
          totalUsers: lb.length,
        });
      } catch (e) {
        logger.error('Wrapped load error', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id, period]);

  const slides = useMemo(() => {
    if (!data || !user) return [] as Array<WrappedSlideOpts & { caption: string }>;
    const refUrl = ReferralService.getReferralLink(user.id);
    const titleSuffix = period === 'month' ? 'Last 30 Days' : 'This Year';

    return [
      {
        type: 'wrapped' as const,
        heading: `Your ${titleSuffix} on JEEnie`,
        bigStat: `${data.totalQuestions}`,
        subStat: `questions solved across ${data.daysActive} active days — that's ${Math.round(data.totalQuestions / Math.max(data.daysActive, 1))}/day on average. 💪`,
        emoji: '📚',
        referralUrl: refUrl,
        caption: 'Insane dedication 🔥',
      },
      {
        type: 'wrapped' as const,
        heading: 'You spent serious time learning',
        bigStat: `${data.hoursStudied}h`,
        subStat: `That's ${Math.round(data.hoursStudied * 60 / Math.max(data.daysActive, 1))} min/day. Quietly building rank-shifting consistency.`,
        emoji: '⏱',
        referralUrl: refUrl,
        caption: 'Time well spent ⌛',
      },
      {
        type: 'wrapped' as const,
        heading: 'Your accuracy',
        bigStat: `${data.accuracy}%`,
        subStat: `${data.totalCorrect}/${data.totalQuestions} correct. ${data.accuracy >= 70 ? 'Sniper-mode unlocked. 🎯' : 'Volume is your superpower — accuracy will follow.'}`,
        emoji: '🎯',
        referralUrl: refUrl,
        caption: 'Sharp shooter 🎯',
      },
      {
        type: 'wrapped' as const,
        heading: 'Your strongest topic',
        bigStat: '★',
        subStat: `${data.strongestTopic} — you absolutely own this. Use it to anchor your weak ones.`,
        emoji: '🏆',
        referralUrl: refUrl,
        caption: 'Strongest topic ★',
      },
      {
        type: 'wrapped' as const,
        heading: 'Weakest topic (kar le isko fix)',
        bigStat: `${data.weakestAccuracy}%`,
        subStat: `${data.weakestTopic} — JEEnie ka next mission: isko 80%+ pe le jaana. 💀`,
        emoji: '💀',
        referralUrl: refUrl,
        caption: 'Weak spot exposed 💀',
      },
      {
        type: 'wrapped' as const,
        heading: 'Tests conquered',
        bigStat: `${data.totalTests}`,
        subStat: `mock tests attempted. Each one made you exam-day-ready. 🧪`,
        emoji: '🧪',
        referralUrl: refUrl,
        caption: 'Mock test warrior 🧪',
      },
      {
        type: 'wrapped' as const,
        heading: 'Longest streak',
        bigStat: `${data.longestStreak}🔥`,
        subStat: `consecutive days. Consistency > intensity, always.`,
        emoji: '🔥',
        referralUrl: refUrl,
        caption: 'Streak king 🔥',
      },
      {
        type: 'wrapped' as const,
        heading: 'JEEnie points earned',
        bigStat: `${data.pointsEarned}`,
        subStat: `points in your wallet. ${data.rank ? `Rank #${data.rank} out of ${data.totalUsers} learners.` : 'Climb the leaderboard next!'}`,
        emoji: '⭐',
        referralUrl: refUrl,
        caption: 'Points machine ⭐',
      },
    ];
  }, [data, user, period]);

  if (loading || !data) return <LoadingScreen pageName="JEEnie Snapshot" message="Cooking your story..." />;

  return (
    <div className="h-dvh overflow-hidden bg-linear-to-br from-[#e6eeff] via-white to-[#f7faff] text-[#013062]">
      <SEOHead
        title="JEEnie Snapshot — Your Learning Recap"
        description="A polished snapshot-style recap for your JEE/NEET prep. See your stats, share your highlights."
        canonical="https://www.jeenie.website/snapshot"
      />
      <Header />
      <main
        className="mx-auto flex w-screen max-w-none flex-col justify-between overflow-hidden px-0"
        style={{
          minHeight: 'calc(100dvh - var(--app-header-height))',
          paddingTop: 'calc(var(--app-header-height) + 10px)',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        <div className="flex justify-center mb-2 sm:mb-3 px-4 sm:px-6 lg:px-10">
          <div className="flex gap-1 bg-white/90 rounded-full p-1 backdrop-blur-xs border border-[#013062]/10 shadow-xs">
            <button
              onClick={() => setPeriod('month')}
              className={`px-3 py-1 text-xs rounded-full ${period === 'month' ? 'bg-[#013062] text-white font-semibold' : 'text-[#013062]/70'}`}
            >
              30 days
            </button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-3 py-1 text-xs rounded-full ${period === 'year' ? 'bg-[#013062] text-white font-semibold' : 'text-[#013062]/70'}`}
            >
              365 days
            </button>
          </div>
        </div>

        <div className="relative flex-1 min-h-0 flex items-center justify-center px-0" style={{ perspective: 1800 }}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(1,48,98,0.10),rgba(1,48,98,0.035)_34%,rgba(255,255,255,0)_70%),linear-gradient(90deg,rgba(230,238,255,0.92)_0%,rgba(255,255,255,0.22)_18%,rgba(255,255,255,0.02)_50%,rgba(255,255,255,0.22)_82%,rgba(230,238,255,0.92)_100%)]" />
          <div className="pointer-events-none absolute inset-y-0 left-0 w-[12vw] bg-linear-to-r from-[#e6eeff] via-[#e6eeff]/70 to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-[12vw] bg-linear-to-l from-[#e6eeff] via-[#e6eeff]/70 to-transparent" />
          <Carousel setApi={setApi} className="relative z-10 w-full max-w-none" opts={{ align: 'center', loop: true }}>
          <CarouselContent className="-ml-2 py-1 sm:py-3 touch-pan-y select-none px-[2vw] sm:px-[4vw] lg:px-[8vw]">
            {slides.map((s, i) => {
              const len = slides.length;
              const raw = Math.abs(i - current);
              const dist = Math.min(raw, Math.abs(raw - len));
              const scale = dist === 0 ? 1 : dist === 1 ? 0.78 : 0.64;
              const opacity = dist === 0 ? 1 : dist === 1 ? 0.46 : 0.18;
              const transformStyle = dist === 0 ? 'translateY(0px) rotateY(0deg)' : dist === 1 ? 'translateY(26px) rotateY(14deg)' : 'translateY(40px) rotateY(20deg)';
              const style = { transform: `scale(${scale}) ${transformStyle}`, transformOrigin: 'center center', opacity } as any;
              return (
                <CarouselItem key={i} className="pl-2 basis-[94%] sm:basis-[66%] lg:basis-[44%] xl:basis-[36%]">
                  <Card style={style} className={`relative overflow-hidden bg-linear-to-br from-white to-[#f4f7fb] border border-[#013062]/10 shadow-[0_22px_50px_rgba(1,48,98,0.12)] transition-transform duration-500 will-change-transform`}>
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(1,48,98,0.10),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(233,233,233,0.9),transparent_42%)]" />
                    <div className="absolute inset-x-0 top-0 h-16 rounded-t-md pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(1,48,98,0.16), rgba(1,48,98,0))' }} />
                    <CardContent className="relative p-4 sm:p-6 lg:p-8 flex flex-col justify-between min-h-[440px] sm:min-h-[520px] lg:min-h-[580px] max-h-[68dvh]">
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-2">
                          <div className="h-px flex-1 bg-linear-to-r from-transparent via-[#013062]/20 to-transparent" />
                          <p className="text-[10px] sm:text-xs uppercase tracking-[0.35em] text-[#013062]/55 whitespace-nowrap">JEENIE SNAPSHOT</p>
                          <div className="h-px flex-1 bg-linear-to-r from-transparent via-[#013062]/20 to-transparent" />
                        </div>
                        <h2 className="text-base sm:text-lg lg:text-xl font-semibold leading-tight text-[#013062]">{s.emoji} {s.heading}</h2>
                      </div>
                      <div className="flex-1 flex items-center justify-center py-3 sm:py-4">
                        <div className="text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-extrabold bg-linear-to-br from-[#013062] via-[#2d6cdf] to-[#7ca7ff] bg-clip-text text-transparent drop-shadow-[0_12px_28px_rgba(1,48,98,0.10)]">
                          {s.bigStat}
                        </div>
                      </div>
                      <div className="space-y-3">
                        <p className="text-xs sm:text-sm text-[#013062]/78 leading-relaxed max-w-120">{s.subStat}</p>
                        <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#013062]/10 text-[11px] text-[#013062]/55 uppercase tracking-[0.22em]">
                          <span>{s.caption}</span>
                          <span>{i + 1}/{slides.length}</span>
                        </div>
                      </div>
                      {shareCardEnabled && (
                        <Button
                          className="mt-3 w-full bg-[#013062] text-white hover:bg-[#013062]/90 font-semibold h-11"
                          onClick={() => { setShareSlide(s); setShareOpen(true); }}
                        >
                          <Share2 className="h-4 w-4 mr-2" /> Share this slide
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </CarouselItem>
              );
            })}
          </CarouselContent>
          <CarouselPrevious className="left-2 sm:left-4 text-[#013062] bg-white/95 border border-[#013062]/10 shadow-lg backdrop-blur-xs" />
          <CarouselNext className="right-2 sm:right-4 text-[#013062] bg-white/95 border border-[#013062]/10 shadow-lg backdrop-blur-xs" />
          </Carousel>
        </div>

        <div className="flex justify-center gap-2 mt-2 sm:mt-3 px-4 sm:px-6 lg:px-10 pb-[max(8px,env(safe-area-inset-bottom))]">
          {slides.map((_, i) => {
            const len = slides.length;
            const raw = Math.abs(i - current);
            const dist = Math.min(raw, Math.abs(raw - len));
            const cls = dist === 0 ? 'w-8 bg-[#013062]' : dist === 1 ? 'w-4 bg-[#013062]/60' : 'w-2 bg-[#013062]/20';
            return <div key={i} className={`h-1.5 rounded-full transition-all ${cls}`} />;
          })}
        </div>
      </main>

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        opts={shareSlide}
        shareText="Mera JEEnie Snapshot dekh! 🧞‍♂️"
        filename={`jeenie-snapshot-${period}.png`}
      />
    </div>
  );
};

export default WrappedPage;
