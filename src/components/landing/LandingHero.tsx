import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Download, SendHorizonal, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const LandingHero = () => {
  const navigate = useNavigate();

  return (
    <div className="relative h-full min-h-full overflow-hidden bg-[radial-gradient(circle_at_top,#f7faff_0%,#ecf2fb_38%,#e5edf8_100%)]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-white/65 to-transparent" />
        <div className="absolute -left-24 top-24 h-72 w-72 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute -right-28 top-28 h-80 w-80 rounded-full bg-sky-400/10 blur-3xl" />
        <div className="absolute left-10 top-10 h-12 w-12 rounded-full border border-white/70 bg-[#b8c6d9]/90 shadow-[0_10px_30px_rgba(148,163,184,0.22)]" />
        <div className="absolute left-16 bottom-24 h-14 w-14 rounded-full border border-white/70 bg-[#a8bdd8]/90 shadow-[0_10px_30px_rgba(148,163,184,0.18)]" />
        <div className="absolute right-14 top-16 h-16 w-16 rounded-full border border-white/70 bg-[#c2d2e6]/90 shadow-[0_10px_30px_rgba(148,163,184,0.2)]" />
        <div className="absolute right-8 bottom-32 h-12 w-12 rounded-full border border-white/70 bg-[#c7d6e9]/90 shadow-[0_10px_30px_rgba(148,163,184,0.18)]" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-[#dce6f4]/60 to-transparent" />
      </div>

      <main className="relative z-10">
        <section className="container mx-auto flex min-h-[calc(100dvh-var(--app-header-height,0px)-var(--app-mobile-nav-height,0px))] items-center px-4 py-6 sm:py-10 sm:px-6 lg:px-10 xl:px-12">
          <div className="grid w-full grid-cols-1 items-center gap-10 sm:gap-12 lg:grid-cols-[1.02fr_0.98fr] xl:gap-16">
            <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
              <Badge className="mb-3 sm:mb-5 rounded-full border border-primary/10 bg-primary/5 px-2.5 py-0.5 text-[10px] sm:text-[11px] font-semibold text-primary">
                <Sparkles className="mr-1 sm:mr-1.5 h-3 w-3 sm:h-3.5 sm:w-3.5" /> AI-Powered JEE Preparation
              </Badge>

              <h1 className="text-[2rem] font-black leading-[1.05] tracking-[-0.035em] text-foreground sm:text-5xl lg:text-6xl">
                Where <span className="text-primary">AI</span> Learns You
              </h1>

              <p className="mt-3 sm:mt-4 max-w-md mx-auto lg:mx-0 text-[15px] leading-6 text-muted-foreground sm:text-lg sm:leading-7">
                India&apos;s first truly personalized JEE learning platform that adapts to your unique learning style and pace.
              </p>

              <div className="mt-5 sm:mt-8 grid max-w-md mx-auto lg:mx-0 grid-cols-3 gap-2 sm:gap-3 rounded-2xl border border-border/60 bg-white/60 p-2.5 sm:p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)] backdrop-blur-xs">
                {[
                  { value: '50K+', label: 'Students' },
                  { value: '1M+', label: 'Questions' },
                  { value: '98%', label: 'Success' },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl px-1 py-0.5 sm:px-2 sm:py-1 text-center">
                    <p className="text-lg sm:text-2xl font-black tracking-[-0.03em] text-primary">{item.value}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 sm:mt-6 flex flex-col gap-2.5 sm:flex-row sm:gap-3 sm:justify-center lg:justify-start">
                <Button className="h-12 sm:h-11 w-full sm:w-auto rounded-full bg-primary px-6 text-[15px] sm:text-sm font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90" onClick={() => navigate('/signup')}>
                  Start Learning Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button variant="outline" className="h-12 sm:h-11 w-full sm:w-auto rounded-full border-primary/30 bg-white/70 px-6 text-[15px] sm:text-sm font-semibold backdrop-blur-xs" onClick={() => navigate('/install')}>
                  <Download className="mr-2 h-4 w-4" /> Download Free
                </Button>
              </div>

              <div className="mt-4 sm:mt-5 flex flex-wrap justify-center lg:justify-start gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-muted-foreground">
                <span>✓ DPP Compliant</span>
                <span>✓ Offline Mode</span>
                <span>✓ 12 Languages</span>
              </div>
            </div>

            <div className="relative mx-auto hidden w-full max-w-[560px] lg:block">
              <div className="absolute -inset-8 rounded-[2.5rem] bg-primary/10 blur-3xl" />
              <div className="absolute inset-0 rounded-4xl border border-white/60 bg-white/20 shadow-[0_10px_40px_rgba(15,23,42,0.06)] backdrop-blur-2xl" />
              <div className="relative rounded-4xl border border-border/70 bg-card/90 p-5 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-xs">
                <div className="mb-4 flex items-center justify-between text-xs font-semibold text-foreground">
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">JEEnie AI Tutor</span>
                  <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-600">● Online</span>
                </div>

                <div className="space-y-3">
                  <div className="max-w-[78%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs text-muted-foreground shadow-xs">
                    Hi! I noticed you&apos;re struggling with quadratic equations. Let me help you with a personalized approach.
                  </div>

                  <div className="ml-auto max-w-[58%] rounded-2xl rounded-br-md bg-primary px-3 py-2 text-xs text-white shadow-xs">
                    Yes, I find it confusing!
                  </div>

                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-xs text-muted-foreground shadow-xs">
                    Perfect! Based on your learning style, I&apos;ll use visual diagrams. Here&apos;s your first question...
                  </div>
                </div>

                <div className="mt-5 flex items-center gap-2 rounded-2xl border border-border bg-background px-3 py-2 shadow-xs">
                  <input
                    readOnly
                    value="Ask me anything..."
                    className="w-full bg-transparent text-xs text-muted-foreground outline-hidden"
                  />
                  <button type="button" className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-white shadow-md shadow-primary/20">
                    <SendHorizonal className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default LandingHero;
