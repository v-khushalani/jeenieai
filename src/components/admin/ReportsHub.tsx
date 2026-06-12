import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Flag } from 'lucide-react';
import { UserReports } from './UserReports';
import { QuestionReportsManager } from './QuestionReportsManager';

interface ReportsHubProps {
  initialTab?: 'users' | 'questions';
}

const ReportsHub: React.FC<ReportsHubProps> = ({ initialTab = 'users' }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'questions'>(initialTab);

  const tabs = [
    {
      id: 'users' as const,
      title: 'User Reports',
      desc: 'Performance, accuracy, study time, premium status across all learners.',
      icon: Users,
    },
    {
      id: 'questions' as const,
      title: 'Question Reports',
      desc: 'User-flagged questions awaiting review, edit, or removal.',
      icon: Flag,
    },
  ];

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-linear-to-br from-primary/5 via-card to-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Reports Center</CardTitle>
          <p className="text-sm text-muted-foreground">
            Track learner performance and resolve community-flagged questions in one place.
          </p>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {tabs.map((t) => {
          const Icon = t.icon;
          const selected = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`text-left rounded-xl border p-4 transition-all ${
                selected
                  ? 'border-primary bg-primary/5 shadow-xs'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="w-4 h-4 text-primary" />
                </div>
                <p className="font-semibold text-sm">{t.title}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t.desc}</p>
            </button>
          );
        })}
      </div>

      {activeTab === 'users' ? <UserReports /> : <QuestionReportsManager />}
    </div>
  );
};

export default ReportsHub;
