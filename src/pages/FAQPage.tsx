import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import SEOHead from '@/components/SEOHead';
import JsonLd, { breadcrumbSchema, faqSchema } from '@/components/JsonLd';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const examFaqs = [
  {
    q: 'How can JEEnie AI help in JEE Main preparation?',
    a: 'JEEnie AI creates a personalized plan for JEE Main based on your weak topics, test performance and remaining timeline. It suggests what to study next and how much to practice daily.',
  },
  {
    q: 'Is JEEnie AI useful for JEE Advanced?',
    a: 'Yes. JEEnie AI supports deeper conceptual practice, adaptive difficulty and topic-level feedback that is useful for JEE Advanced preparation.',
  },
  {
    q: 'Does JEEnie AI support NEET aspirants?',
    a: 'Yes. NEET students can practice Physics, Chemistry and Biology with targeted question sets, progress tracking and consistency-focused study planning.',
  },
  {
    q: 'Can Olympiad students use JEEnie AI?',
    a: 'Yes. The platform can be used for Olympiad-focused practice by adapting topic priorities and challenge level to your current performance.',
  },
  {
    q: 'What is personalized learning in JEEnie AI?',
    a: 'Personalized learning means your study path is adjusted continuously using your attempts, speed, accuracy and topic mastery, so you spend more time on high-impact topics.',
  },
  {
    q: 'Is there a free plan available?',
    a: 'Yes. You can start with a free plan and upgrade later if you want premium features like advanced analytics and AI planner access.',
  },
];

const FAQPage = () => {
  return (
    <div className="mobile-app-shell bg-background">
      <SEOHead
        title="JEE, NEET and Olympiad FAQ"
        description="Frequently asked questions on JEE Main, JEE Advanced, NEET and Olympiad preparation with JEEnie AI personalized learning."
        canonical="https://www.jeenie.website/faq"
      />
      <JsonLd data={faqSchema(examFaqs)} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', item: 'https://www.jeenie.website/' },
          { name: 'FAQ', item: 'https://www.jeenie.website/faq' },
        ])}
      />
      <Header />

      <main className="mobile-app-shell-content">
        <div className="container mx-auto max-w-4xl px-4 py-8">
        <section className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-primary mb-3">Frequently Asked Questions</h1>
          <p className="text-muted-foreground">
            Common questions about personalized learning for JEE Main, JEE Advanced, NEET and Olympiad prep.
          </p>
        </section>

        <section className="space-y-4">
          {examFaqs.map((faq) => (
            <Card key={faq.q}>
              <CardContent className="p-5">
                <h2 className="text-lg font-semibold text-foreground mb-2">{faq.q}</h2>
                <p className="text-sm text-muted-foreground">{faq.a}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-8 rounded-xl border border-border p-6 bg-card">
          <h2 className="text-xl font-semibold text-primary mb-2">Need More Help?</h2>
          <p className="text-muted-foreground mb-4">
            You can start free and explore how JEEnie AI adapts to your learning style and exam goal.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Button asChild>
              <Link to="/signup">Create Free Account</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/why-us">Why JEEnie Works</Link>
            </Button>
          </div>
        </section>
        </div>
      </main>
    </div>
  );
};

export default FAQPage;
