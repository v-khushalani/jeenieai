import Header from '@/components/Header';
import AIStudyPlanner from '@/components/AIStudyPlanner';

const AIStudyPlannerPage = () => {
  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-7xl">
          <AIStudyPlanner />
        </div>
      </div>
    </div>
  );
};

export default AIStudyPlannerPage;
