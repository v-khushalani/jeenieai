import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import SEOHead from '@/components/SEOHead';
import JsonLd, { breadcrumbSchema } from '@/components/JsonLd';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  MessageSquare,
  
  CheckCircle2,
  CircleAlert,
  Target,
  Trophy,
  Zap,
  Rocket,
} from 'lucide-react';

const coreFeatures = [
  {
    icon: MessageSquare,
    title: 'AI Doubt Solver',
    desc: 'Step-by-step explanation in simple Hinglish, instantly.',
  },
  {
    icon: Zap,
    title: 'Adaptive Difficulty',
    desc: 'Too easy? It levels up. Too hard? It recovers your confidence.',
  },
  {
    icon: BookOpen,
    title: 'Comprehensive Questions',
    desc: 'Physics, Chemistry, Maths practice mapped to exam needs.',
  },
  {
    icon: Target,
    title: 'Smart Practice',
    desc: 'Weak topics auto-prioritized for faster improvement.',
  },
  {
    icon: BarChart3,
    title: 'Action Analytics',
    desc: 'See what to fix next, not just pretty charts.',
  },
  {
    icon: Trophy,
    title: 'Gamified Momentum',
    desc: 'Points, streaks, and badges that reward consistency.',
  },
];

const WhyUsPage = () => {
  const navigate = useNavigate();
  const { data: plans = [] } = useSubscriptionPlans();

  const lowestMonthly = useMemo(() => {
    const monthlyPrices = plans
      .filter((p) => p.duration_days < 365)
      .map((p) => Number(p.price))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (monthlyPrices.length === 0) return null;
    return Math.min(...monthlyPrices);
  }, [plans]);

  const priceLabel = lowestMonthly ? `₹${lowestMonthly}/mo` : 'Affordable';

  const comparisonData = [
    { feature: 'AI Doubt Solving', us: true as const, others: false as const },
    { feature: 'Adaptive Difficulty', us: true as const, others: false as const },
    { feature: 'Personalized Study Plan', us: true as const, others: false as const },
    { feature: 'Parent Dashboard', us: true as const, others: false as const },
    { feature: 'Smart Analytics', us: true as const, others: 'Basic' },
    { feature: 'Gamification', us: true as const, others: 'Basic' },
    { feature: 'Affordable Pricing', us: priceLabel, others: '₹500+' },
  ];

  return (
    <div className="mobile-app-shell bg-background">
      <SEOHead
        title="Why Choose JEEnie AI for JEE &amp; NEET Prep"
        description="Compare JEEnie AI with other coaching apps. AI doubt solving, adaptive difficulty, personalized study plans, parent dashboard & gamified learning."
        canonical="https://www.jeenie.website/why-us"
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', item: 'https://www.jeenie.website/' },
          { name: 'Why Us', item: 'https://www.jeenie.website/why-us' },
        ])}
      />
      <Header />
      <main className="mobile-app-shell-content">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Hero */}
        <section className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
             WHY JEENIE (ABOUT + WHY US)
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-3">
            Built for score growth, not content overload
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            JEEnie exists because most students don&apos;t fail due to lack of content.
            They fail due to lack of direction, feedback speed, and consistency loops.
            This page is now the single source of truth for what we are and why we work.
          </p>
        </section>

        {/* The Brutal Honesty Section */}
        <section className="mb-16">
          <Card className="border-red-500/20 bg-linear-to-br from-red-500/5 via-card to-orange-500/5 overflow-hidden">
            <CardContent className="p-8 sm:p-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                  <CircleAlert className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">A Message from the Co-Founders</h2>
                  <p className="text-sm text-muted-foreground uppercase tracking-widest">Brutally Honest</p>
                </div>
              </div>
              
              <div className="space-y-6 text-foreground leading-relaxed">
                <div className="space-y-2">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" /> 1. Stop solving, start learning.
                  </h3>
                  <p className="text-muted-foreground pl-7">
                    Most apps just dump 100k questions on you and call it "practice." That's not learning; that's data entry. 
                    JEEnie tracks <strong>why</strong> you got it wrong. If you're solving 100 questions but repeating the same mistake, 
                    you're wasting time. We force you to face your gaps.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-blue-500" /> 2. Doubt solvers aren't meant to be "Formal."
                  </h3>
                  <p className="text-muted-foreground pl-7">
                    Traditional solutions read like a textbook. If you understood the textbook, you wouldn't have a doubt. 
                    Our AI (JEEnie) explains concepts like a <strong>Bada Bhai</strong> (Big Brother). We use intuition, analogies, 
                    and warn you about common traps before you fall into them.
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Target className="w-5 h-5 text-red-500" /> 3. Direction &gt; Hard Work.
                  </h3>
                  <p className="text-muted-foreground pl-7">
                    A student studying 12 hours without a plan will lose to a student studying 6 hours with a JEEnie Roadmap. 

                    We tell you <strong>exactly</strong> what to solve today to move your rank. No guesswork, no doom-scrolling through chapters.
                  </p>
                </div>

                <div className="pt-4 border-t border-border">
                  <p className="italic text-primary font-medium">
                    &quot;JEEnie isn&apos;t for those who want a fancy library. It&apos;s for those who are tired of being average and want a 
                    system that pushes them to be elite. We&apos;re not here to be your friend; we&apos;re here to be your mentor.&quot;
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Core Features */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8 text-primary">
            What Makes JEEnie Different
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {coreFeatures.map((f) => (
              <Card key={f.title} className="group hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                    <f.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Comparison Table */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8 text-primary">
            JEEnie AI vs Others
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-primary/20">
                  <th className="text-left py-3 px-4 text-foreground font-semibold">Feature</th>
                  <th className="text-center py-3 px-4 text-primary font-semibold">JEEnie AI</th>
                  <th className="text-center py-3 px-4 text-muted-foreground font-semibold">
                    Others
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row) => (
                  <tr key={row.feature} className="border-b border-border hover:bg-muted/30">
                    <td className="py-3 px-4 text-foreground text-sm">{row.feature}</td>
                    <td className="py-3 px-4 text-center">
                      {row.us === true ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500 mx-auto" />
                      ) : (
                        <span className="text-sm font-semibold text-primary">{row.us}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.others === false ? (
                        <CircleAlert className="w-5 h-5 text-red-400 mx-auto" />
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.others}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Working Model */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-center mb-8 text-primary">
            How Improvement Actually Happens Here
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              { icon: Target, title: 'Find Gaps', desc: 'Weak topics are auto-flagged from test behavior.' },
              { icon: Zap, title: 'Quick Fix', desc: 'AI explains exactly where your logic broke.' },
              { icon: Trophy, title: 'Build Streak', desc: 'Small daily wins compound into rank-level shifts.' },
              { icon: Rocket, title: 'Scale Up', desc: 'Difficulty rises as consistency improves.' },
            ].map((step) => (
              <Card key={step.title}>
                <CardContent className="p-5">
                  <step.icon className="w-5 h-5 text-primary mb-2" />
                  <h3 className="font-semibold text-foreground mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Social Proof */}
        <section className="mb-16 text-center">
          <h2 className="text-2xl font-bold mb-6 text-primary">Trusted by Students</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Active Students', value: '10,000+' },
              { label: 'Questions Solved', value: '5L+' },
              { label: 'Avg Score Boost', value: '+23%' },
              { label: 'AI Sessions', value: '50K+' },
            ].map((s) => (
              <div key={s.label} className="p-4 rounded-xl bg-card border border-border">
                <div className="text-2xl font-bold text-primary">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-8">
          <h2 className="text-2xl font-bold mb-3 text-primary">Ready to Start?</h2>
          <p className="text-muted-foreground mb-6">
            Join students who are replacing random prep with focused score growth.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={() => navigate('/signup')}>
              Start Free <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate('/subscription-plans')}>
              View Plans
            </Button>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
};

export default WhyUsPage;
