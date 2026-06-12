// src/pages/BadgesPage.tsx
// Full-page badge showcase with earning progress

import Header from '@/components/Header';
import BadgesShowcase from '@/components/gamification/BadgesShowcase';

const BadgesPage = () => {
  return (
    <div className="mobile-app-shell bg-linear-to-b from-slate-50 to-white dark:from-slate-950 dark:to-slate-900 flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto container mx-auto px-4 py-4 max-w-4xl">
        <BadgesShowcase />
      </div>
    </div>
  );
};

export default BadgesPage;
