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
  Sparkles,
  CheckCircle2,
  CircleAlert,
  Target,
  Trophy,
  Zap,
  Rocket,
} from 'lucide-react';

const coreFeatures = [
  {
    icon: Sparkles,
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
            <Sparkles className="w-3 h-3 mr-1" /> WHY JEENIE (ABOUT + WHY US)
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

        {/* Mission */}
        <section className="mb-14">
          <Card className="border-primary/20 bg-linear-to-br from-primary/5 via-card to-secondary/40">
            <CardContent className="p-6 sm:p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <h2 className="text-2xl font-bold text-primary mb-2">Our Mission</h2>
                  <p className="text-sm sm:text-base text-muted-foreground">
                    Give every JEE/NEET aspirant a focused preparation engine that feels
                    like a personal coach: clear next steps, fast doubt solving, and daily
                    momentum tracking that actually changes results.
                  </p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground mb-1">Promise</p>
                  <p className="text-lg font-bold text-foreground">Study Less Randomly.</p>
                  <p className="text-sm font-semibold text-primary">Improve More Predictably.</p>
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
