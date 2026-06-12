import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Target, Brain, ChevronRight, X, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

import safeLocalStorage from '@/utils/safeStorage';
const ONBOARDING_KEY = 'jeenie_onboarding_done';

const steps = [
  {
    icon: BookOpen,
    title: 'Practice Smart',
    description: 'Access thousands of JEE/NEET questions. Study chapter-wise or take full mock tests. Your progress is tracked automatically.',
    gradient: 'from-primary to-blue-600',
  },
  {
    icon: Target,
    title: 'Track Your Growth',
    description: 'See your accuracy, streaks, and subject-wise performance. Our analytics show exactly where you need to improve.',
    gradient: 'from-emerald-600 to-green-700',
  },
  {
    icon: Brain,
    title: 'AI-Powered Help',
    description: 'Stuck on a problem? Use JEEnie AI to get step-by-step explanations. Plus, get a personalized AI study plan!',
    gradient: 'from-violet-600 to-purple-700',
  },
];

const OnboardingTutorial = () => {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Check both old and new keys for backward compat
    const done = safeLocalStorage.getItem(ONBOARDING_KEY) || safeLocalStorage.getItem('jeenius_onboarding_done');
    if (!done) {
      const t = setTimeout(() => setShow(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const finish = () => {
    safeLocalStorage.setItem(ONBOARDING_KEY, 'true');
    // Also set old key so it doesn't show again
    safeLocalStorage.setItem('jeenius_onboarding_done', 'true');
    setShow(false);
  };

  const next = () => {
    if (step < steps.length - 1) setStep(step + 1);
    else finish();
  };

  if (!show) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-100 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={finish} />

        {/* Card */}
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-sm bg-card text-card-foreground rounded-2xl shadow-2xl overflow-hidden"
        >
          {/* Skip button */}
          <button
            onClick={finish}
            className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="h-4 w-4 text-white" />
          </button>

          {/* Top gradient section */}
          <div className={`bg-linear-to-br ${current.gradient} p-8 pt-10 flex flex-col items-center text-white`}>
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: 'spring' }}
              className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center mb-4 shadow-lg"
            >
              <Icon className="h-8 w-8" />
            </motion.div>
            <h2 className="text-xl font-bold mb-1">{current.title}</h2>
            <div className="flex gap-1.5 mt-3">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {current.description}
            </p>

            <div className="flex gap-3">
              {step > 0 && (
                <Button
                  variant="outline"
                  onClick={() => setStep(step - 1)}
                  className="flex-1 rounded-xl h-11"
                >
                  Back
                </Button>
              )}
              <Button
                onClick={next}
                className={`flex-1 rounded-xl h-11 bg-linear-to-r ${current.gradient} hover:opacity-90 text-white gap-2`}
              >
                {step === steps.length - 1 ? (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Let's Go!
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            <button onClick={finish} className="mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors">
              Skip tutorial
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default OnboardingTutorial;
