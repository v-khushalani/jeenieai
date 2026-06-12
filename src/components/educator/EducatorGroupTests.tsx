import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Users, Clock, Trophy, Loader2, QrCode, Eye } from 'lucide-react';
import { logger } from '@/utils/logger';
import { generateQRCodeSVG } from '@/utils/qrCode';

interface GroupTest {
  id: string;
  test_code: string;
  title: string;
  question_ids: string[];
  duration_minutes: number;
  subject: string | null;
  chapter_names: string[];
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  sessions_count?: number;
}

const EducatorGroupTests: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [tests, setTests] = useState<GroupTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showQR, setShowQR] = useState<string | null>(null);

  const loadTests = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('group_tests')
        .select('*')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get session counts for each test
      const testsWithCounts = await Promise.all(
        (data || []).map(async (test: any) => {
          const { data: sessionRows } = await supabase
            .from('test_sessions')
            .select('id')
            .eq('group_test_id', test.id);
          return { ...test, sessions_count: sessionRows?.length || 0 };
        })
      );

      setTests(testsWithCounts);
    } catch (err) {
      logger.error('Failed to load group tests:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user?.id) loadTests();
  }, [user?.id, loadTests]);

  const isExpired = (test: GroupTest) => {
    if (!test.expires_at) return false;
    return new Date(test.expires_at) < new Date();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Group Tests</h2>
          <p className="text-sm text-muted-foreground">Create tests for students to join via QR code</p>
        </div>
        <Button onClick={() => navigate('/group-test/create')} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Test
        </Button>
      </div>

      {tests.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-base font-semibold text-foreground mb-1">No group tests yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Create your first test and share the QR code with students</p>
            <Button onClick={() => navigate('/group-test/create')} variant="outline" className="gap-2">
              <Plus className="h-4 w-4" />
              Create First Test
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {tests.map((test) => {
            const expired = isExpired(test);
            return (
              <Card key={test.id} className={`transition-all ${expired ? 'opacity-60' : ''}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-sm font-semibold line-clamp-2">{test.title}</CardTitle>
                    <Badge variant={expired ? 'secondary' : 'default'} className="shrink-0 text-xs">
                      {expired ? 'Expired' : 'Active'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Trophy className="h-3 w-3" />
                      <span>{test.question_ids?.length || 0} Q</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{test.duration_minutes}m</span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Users className="h-3 w-3" />
                      <span>{test.sessions_count} joined</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                    <span className="text-xs font-mono font-bold tracking-wider text-foreground flex-1">
                      Code: {test.test_code}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => setShowQR(showQR === test.id ? null : test.id)}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  </div>

                  {showQR === test.id && (
                    <div
                      className="flex justify-center p-3 bg-white rounded-lg border"
                      dangerouslySetInnerHTML={{
                        __html: generateQRCodeSVG(`${window.location.origin}/group-test/join?code=${test.test_code}`, 180),
                      }}
                    />
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => navigate(`/group-test/${test.test_code}/leaderboard`)}
                  >
                    <Eye className="h-4 w-4" />
                    View Leaderboard
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default EducatorGroupTests;
