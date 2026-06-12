import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, Package, ArrowRight, Clock3, Layers3 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ExamDateManager from '@/components/admin/ExamDateManager';
import { BatchManager } from '@/components/admin/BatchManager';

interface AdminSetupHubProps {
  initialTab?: 'exams' | 'batches';
}

const AdminSetupHub: React.FC<AdminSetupHubProps> = ({ initialTab = 'exams' }) => {
  const [activeTab, setActiveTab] = useState<'exams' | 'batches'>(initialTab);
  const [stats, setStats] = useState({ exams: 0, activeExams: 0, batches: 0, activeBatches: 0 });

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const loadStats = async () => {
      const [exams, activeExams, batches, activeBatches] = await Promise.all([
        supabase.from('exam_config').select('id', { count: 'exact', head: true }),
        supabase.from('exam_config').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('batches').select('id', { count: 'exact', head: true }),
        supabase.from('batches').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      setStats({
        exams: exams.count || 0,
        activeExams: activeExams.count || 0,
        batches: batches.count || 0,
        activeBatches: activeBatches.count || 0,
      });
    };

    loadStats();
  }, []);

  const cards = useMemo(
    () => [
      {
        id: 'exams' as const,
        title: 'Exam Timeline Setup',
        desc: 'Manage exam dates, registration windows, and active timelines.',
        icon: Calendar,
        stat: `${stats.activeExams}/${stats.exams} active`,
      },
      {
        id: 'batches' as const,
        title: 'Batch Structure Setup',
        desc: 'Configure grade + exam combinations, pricing, and subject bundles.',
        icon: Package,
        stat: `${stats.activeBatches}/${stats.batches} active`,
      },
    ],
    [stats]
  );

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-linear-to-br from-primary/5 via-card to-secondary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Exam and Batch Setup Center</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use this section to keep exam timelines and paid/free content batches aligned.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock3 className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm">Timeline Rule</p>
            </div>
            <p className="text-xs text-muted-foreground">Each active exam date should map to the right study roadmap and reminders.</p>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2 mb-1">
              <Layers3 className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm">Batch Rule</p>
            </div>
            <p className="text-xs text-muted-foreground">Each batch should have clear grade, exam type, and subject coverage before publishing.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {cards.map((item) => {
          const Icon = item.icon;
          const selected = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`text-left rounded-xl border p-4 transition-all ${selected ? 'border-primary bg-primary/5 shadow-xs' : 'border-border bg-card hover:border-primary/30'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <p className="font-semibold text-sm">{item.title}</p>
                </div>
                {selected && <Badge className="text-[10px]">Selected</Badge>}
              </div>
              <p className="text-xs text-muted-foreground mb-2">{item.desc}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-primary">{item.stat}</span>
                <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            </button>
          );
        })}
      </div>

      {activeTab === 'exams' ? <ExamDateManager /> : <BatchManager />}
    </div>
  );
};

export default AdminSetupHub;
