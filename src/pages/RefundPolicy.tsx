import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import SEOHead from '@/components/SEOHead';
import Header from '@/components/Header';

const RefundPolicy = () => {
  return (
    <div className="mobile-app-shell bg-background">
      <SEOHead
        title="Refund &amp; Cancellation Policy"
        description="JEEnie AI refund and cancellation policy. Full refund within 7 days if premium features are unused. Learn about eligibility, process and timelines."
        canonical="https://www.jeenie.website/refund-policy"
      />
      <Header />
      <div className="mobile-app-shell-content">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <Link to="/" className="inline-flex items-center text-primary hover:underline mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-primary mb-2">Refund & Cancellation Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="prose prose-slate max-w-none space-y-6">
          <section><h2 className="text-xl font-semibold text-primary">1. Subscription Cancellation</h2><ul className="list-disc pl-6 space-y-1"><li>You may cancel your subscription at any time from the Settings page.</li><li>Upon cancellation, you will retain access to premium features until the end of your current billing period.</li><li>No partial refunds are provided for the remaining days of the current billing cycle.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">2. Refund Eligibility</h2><p>Refunds are available under the following conditions:</p><ul className="list-disc pl-6 space-y-1"><li><strong>Within 7 days of purchase:</strong> Full refund if you have not used premium features extensively (less than 5 AI sessions or tests attempted).</li><li><strong>Technical issues:</strong> If you are unable to access premium features due to technical problems on our end, we will issue a full refund or extend your subscription.</li><li><strong>Duplicate payment:</strong> If you are charged multiple times for the same subscription, we will refund the duplicate charges immediately.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">3. Non-Refundable Cases</h2><ul className="list-disc pl-6 space-y-1"><li>Requests made after 7 days of purchase.</li><li>If premium features have been extensively used.</li><li>Violation of our Terms of Service leading to account suspension.</li><li>Change of mind after significant usage of the platform.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">4. How to Request a Refund</h2><ol className="list-decimal pl-6 space-y-1"><li>Email us at <a href="mailto:support@jeenie.website" className="text-primary underline">support@jeenie.website</a> with your registered email and reason for refund.</li><li>Include your transaction ID (available in your Settings page or Razorpay receipt).</li><li>We will review your request within 3-5 business days.</li><li>Approved refunds will be processed to the original payment method within 5-7 business days.</li></ol></section>
          <section><h2 className="text-xl font-semibold text-primary">5. Batch/Course Purchases</h2><ul className="list-disc pl-6 space-y-1"><li>Batch purchases are non-refundable once access has been granted.</li><li>If a batch is cancelled by us, a full refund will be issued.</li></ul></section>
          <section><h2 className="text-xl font-semibold text-primary">6. Contact</h2><p>For refund-related queries:<br />JEEnie AI<br />Email: <a href="mailto:support@jeenie.website" className="text-primary underline">support@jeenie.website</a></p></section>
        </div>
      </div>
      </div>
    </div>
  );
};

export default RefundPolicy;
