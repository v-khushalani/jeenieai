import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEOHead from '@/components/SEOHead';
import Header from '@/components/Header';

const PrivacyPolicy = () => {
  return (
    <div className="mobile-app-shell bg-background">
      <SEOHead
        title="Privacy Policy"
        description="Learn how JEEnie AI collects, uses and protects your personal data. We are committed to keeping your academic data safe and private."
        canonical="https://www.jeenie.website/privacy-policy"
      />
      <Header />
      <div className="mobile-app-shell-content">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center text-primary hover:underline mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-primary mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="prose prose-slate max-w-none space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-primary">1. Information We Collect</h2>
            <p>JEEnie AI ("we", "our", "us") collects the following information when you use our platform:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Account Information:</strong> Name, email address, phone number, and password when you create an account.</li>
              <li><strong>Academic Data:</strong> Your exam goal (JEE/NEET), study progress, test scores, topic mastery levels, and learning preferences.</li>
              <li><strong>Payment Information:</strong> Transaction details processed securely through Razorpay. We do not store your card or bank details.</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, device information, and browser type for improving our services.</li>
              <li><strong>AI Interaction Data:</strong> Questions asked to JEEnie AI to improve response quality.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">2. How We Use Your Information</h2>
            <ul className="list-disc pl-6 space-y-1">
              <li>To provide personalized AI-powered study plans and recommendations.</li>
              <li>To track your learning progress and generate analytics.</li>
              <li>To process payments and manage subscriptions.</li>
              <li>To send important updates about your account and our services.</li>
              <li>To improve our platform and AI models.</li>
              <li>To detect and prevent fraud or abuse.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">3. Data Storage & Security</h2>
            <p>Your data is stored securely on Supabase (PostgreSQL) with encryption at rest and in transit. We implement industry-standard security measures including HTTPS, secure headers, and access controls. Our servers are hosted in compliance with applicable data protection laws.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">4. Data Sharing</h2>
            <p>We do not sell your personal data. We may share data with:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Service Providers:</strong> Razorpay (payments), Supabase (database), Google/OpenAI (AI services), Sentry (error tracking), and Mixpanel (analytics).</li>
              <li><strong>Parent Dashboard:</strong> If a parent account is linked, they can view your study progress and scores.</li>
              <li><strong>Legal Requirements:</strong> When required by law or to protect our rights.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">5. Your Rights</h2>
            <p>You have the right to:</p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Access and download your personal data.</li>
              <li>Request correction of inaccurate data.</li>
              <li>Request deletion of your account and data.</li>
              <li>Opt out of non-essential communications.</li>
            </ul>
            <p>To exercise these rights, contact us at <a href="mailto:support@jeenie.website" className="text-primary underline">support@jeenie.website</a>.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">6. Cookies & Tracking</h2>
            <p>We use essential cookies for authentication and session management. We use analytics tools (Mixpanel, Google Analytics) to understand usage patterns. You can disable non-essential cookies in your browser settings.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">7. Children's Privacy</h2>
            <p>Our platform is designed for JEE/NEET aspirants (typically ages 15-19). Users under 18 should have parental consent before creating an account. Parents can monitor progress through our Parent Dashboard feature.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">8. Changes to This Policy</h2>
            <p>We may update this policy periodically. We will notify you of significant changes via email or in-app notification.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-primary">9. Contact Us</h2>
            <p>For any privacy-related queries:</p>
            <p>JEEnie AI<br />
            Email: <a href="mailto:support@jeenie.website" className="text-primary underline">support@jeenie.website</a></p>
          </section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
