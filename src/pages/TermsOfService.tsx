import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEOHead from '@/components/SEOHead';
import Header from '@/components/Header';

const TermsOfService = () => {
  return (
    <div className="mobile-app-shell bg-background">
      <SEOHead
        title="Terms of Service"
        description="Read the Terms of Service for JEEnie AI. Learn about subscription terms, acceptable use, intellectual property and liability for our AI-powered exam prep platform."
        canonical="https://www.jeenie.website/terms-of-service"
      />
      <Header />
      <div className="mobile-app-shell-content">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center text-primary hover:underline mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-primary mb-2">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="prose prose-slate max-w-none space-y-6">
          <section><h2 className="text-xl font-semibold text-primary">1. Acceptance of Terms</h2><p>By accessing or using JEEnie AI ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree, please do not use our platform.</p></section>
          <section><h2 className="text-xl font-semibold text-primary">2. Description of Service</h2><p>JEEnie AI is an AI-powered educational platform that provides:</p><ul className="list-disc pl-6 space-y-1"><li>Personalized study plans for JEE Main, JEE Advanced, and NEET preparation.</li><li>AI-powered doubt solving (JEEnie AI assistant).</li><li>Practice questions, mock tests, and performance analytics.</li><li>Gamification features (streaks, points, leaderboards, badges).</li><li>Parent dashboard for monitoring student progress.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">3. User Accounts</h2><ul className="list-disc pl-6 space-y-1"><li>You must provide accurate information when creating an account.</li><li>You are responsible for maintaining the security of your account credentials.</li><li>You must not share your account with others.</li><li>Users under 18 must have parental consent to use the platform.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">4. Subscription & Payments</h2><ul className="list-disc pl-6 space-y-1"><li>Free tier provides limited access to platform features.</li><li>Premium subscriptions are available at ₹99/month or ₹499/year.</li><li>All payments are processed securely through Razorpay.</li><li>Prices are in Indian Rupees (INR) and inclusive of applicable taxes.</li><li>Subscriptions auto-renew unless cancelled before the renewal date.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">5. Refund Policy</h2><p>Please refer to our <Link to="/refund-policy" className="text-primary underline">Refund Policy</Link> for details on cancellations and refunds.</p></section>
          <section><h2 className="text-xl font-semibold text-primary">6. Acceptable Use</h2><p>You agree not to:</p><ul className="list-disc pl-6 space-y-1"><li>Use the platform for any unlawful purpose.</li><li>Attempt to reverse-engineer or extract our AI models or algorithms.</li><li>Share, distribute, or commercially exploit our content without permission.</li><li>Use automated tools to scrape data from the platform.</li><li>Abuse the AI assistant or submit harmful/inappropriate content.</li><li>Manipulate leaderboards, points, or gamification systems.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">7. Intellectual Property</h2><p>All content, including questions, study materials, AI-generated responses, designs, and code, is the property of JEEnie AI. You may not reproduce or distribute this content without written permission.</p></section>
          <section><h2 className="text-xl font-semibold text-primary">8. AI Disclaimer</h2><p>JEEnie AI provides educational assistance but may occasionally produce inaccurate responses. AI-generated content should be verified and is not a substitute for qualified teachers. We are not liable for decisions made based on AI responses.</p></section>
          <section><h2 className="text-xl font-semibold text-primary">9. Limitation of Liability</h2><p>JEEnie AI is provided "as is" without warranties. We do not guarantee specific exam results or outcomes. Our total liability is limited to the amount paid by you in the 12 months prior to the claim.</p></section>
          <section><h2 className="text-xl font-semibold text-primary">10. Termination</h2><p>We reserve the right to suspend or terminate accounts that violate these terms. You may delete your account at any time through Settings.</p></section>
          <section><h2 className="text-xl font-semibold text-primary">11. Governing Law</h2><p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of the courts in India.</p></section>
          <section><h2 className="text-xl font-semibold text-primary">12. Contact</h2><p>For questions about these terms:<br />JEEnie AI<br />Email: <a href="mailto:support@jeenie.website" className="text-primary underline">support@jeenie.website</a></p></section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default TermsOfService;
