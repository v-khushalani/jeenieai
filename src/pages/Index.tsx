import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import SEOHead from '@/components/SEOHead';
import JsonLd, { organizationSchema, websiteSchema, softwareAppSchema, faqSchema } from '@/components/JsonLd';
import LandingHero from '@/components/landing/LandingHero';
import Header from '@/components/Header';

const jeenieAIFaqs = [
  { q: 'What is JEEnie AI?', a: 'JEEnie AI is an AI-powered personalized learning platform for JEE Main, JEE Advanced, NEET and Foundation exam preparation with adaptive question banks, smart analytics and gamified learning.' },
  { q: 'Is JEEnie AI free?', a: 'Yes! JEEnie AI offers a generous free tier with limited tests and AI sessions. Premium plans start at just ₹99/month for unlimited access.' },
  { q: 'Which exams does JEEnie AI cover?', a: 'JEEnie AI covers JEE Main, JEE Advanced, NEET (Biology, Physics, Chemistry) and Foundation level (Class 9-10) board exams.' },
  { q: 'How does AI personalization work?', a: 'JEEnie AI analyzes your performance, identifies weak topics, and dynamically adjusts difficulty and study plans to maximize your score improvement.' },
];

const Index = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="mobile-app-shell-header-only flex flex-col bg-background">
      <SEOHead
        title={undefined}
        description="Crack JEE Main, JEE Advanced & NEET with AI-personalized study plans, 50,000+ questions, smart analytics & gamified learning. Start free today!"
        canonical="https://www.jeenie.website"
      />
      <JsonLd data={organizationSchema} />
      <JsonLd data={websiteSchema} />
      <JsonLd data={softwareAppSchema} />
      <JsonLd data={faqSchema(jeenieAIFaqs)} />
      <Header />
      <main className="flex-1 min-h-0 overflow-y-auto">
        <LandingHero />
      </main>
    </div>
  );
};

export default Index;
