import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Header from '@/components/Header';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { logger } from '@/utils/logger';
import {
  Trophy, TrendingUp, Clock, Target, ArrowLeft,
  ChevronLeft, ChevronRight, BarChart3, Calendar
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';

interface TestRecord {
  id: string;
  title: string | null;
  subject: string | null;
  score: number | null;
  accuracy: number | null;
  correct_answers: number | null;
  total_questions: number | null;
  attempted_questions: number | null;
  time_taken: number | null;
  status: string | null;
  completed_at: string | null;
  created_at: string | null;
  group_test_id: string | null;
}

const PAGE_SIZE = 15;

const TestHistoryPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tests, setTests] = useState<TestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<'all' | 'solo' | 'group'>('all');

  const loadTests = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('test_sessions')
        .select('id, title, subject, score, accuracy, correct_answers, total_questions, attempted_questions, time_taken, status, completed_at, created_at, group_test_id', { count: 'exact' })
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (filter === 'solo') query = query.is('group_test_id', null);
      if (filter === 'group') query = query.not('group_test_id', 'is', null);

      const from = (page - 1) * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      setTests(data || []);
      setTotalCount(count || 0);
    } catch (err) {
      logger.error('Failed to load test history', err);
    } finally {
      setLoading(false);
    }
  }, [user, page, filter]);

  useEffect(() => {
    if (user) loadTests();
  }, [user, loadTests]);

  // Summary stats from all loaded tests
  const allCompleted = tests.filter(t => t.status === 'completed');
  const avgScore = allCompleted.length > 0
    ? Math.round(allCompleted.reduce((s, t) => s + (t.score || 0), 0) / allCompleted.length)
    : 0;
  const bestScore = allCompleted.length > 0
    ? Math.max(...allCompleted.map(t => t.score || 0))
    : 0;
  const totalTime = allCompleted.reduce((s, t) => s + (t.time_taken || 0), 0);

  // Chart data (reverse to show chronological order)
  const chartData = [...allCompleted]
    .reverse()
    .map(t => ({
      date: t.completed_at ? new Date(t.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '',
      score: t.score || 0,
      accuracy: t.accuracy || 0,
    }));

  const formatTime = (seconds: number) => {
    if (!seconds) return '0m';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (loading && tests.length === 0) return <LoadingScreen pageName="Test History" />;

  return (
    <div className="mobile-app-shell bg-background">
      <Header />
      <div className="mobile-app-shell-content">
        <div className="container mx-auto px-4 py-6 max-w-4xl pb-6">
        {/* Back + Title */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Test History</h1>
            <p className="text-sm text-muted-foreground">{totalCount} tests completed</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card>
            <CardContent className="p-3 text-center">
              <Trophy className="w-5 h-5 mx-auto mb-1 text-yellow-500" />
              <div className="text-lg font-bold">{totalCount}</div>
              <div className="text-xs text-muted-foreground">Total Tests</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <TrendingUp className="w-5 h-5 mx-auto mb-1 text-green-500" />
              <div className="text-lg font-bold">{avgScore}%</div>
              <div className="text-xs text-muted-foreground">Avg Score</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Target className="w-5 h-5 mx-auto mb-1 text-blue-500" />
              <div className="text-lg font-bold">{bestScore}%</div>
              <div className="text-xs text-muted-foreground">Best Score</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <Clock className="w-5 h-5 mx-auto mb-1 text-purple-500" />
              <div className="text-lg font-bold">{Math.round(totalTime / 60)}m</div>
              <div className="text-xs text-muted-foreground">Total Time</div>
            </CardContent>
          </Card>
        </div>

        {/* Score Trend Chart */}
        {chartData.length > 1 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Score Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="score" stroke="hsl(var(--primary))" fill="url(#scoreGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          {(['all', 'solo', 'group'] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setFilter(f); setPage(1); }}
              className="text-xs capitalize"
            >
              {f === 'all' ? 'All Tests' : f === 'solo' ? 'Solo' : 'Group'}
            </Button>
          ))}
        </div>

        {/* Test List */}
        <div className="space-y-2">
          {tests.length === 0 && !loading && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No tests found. Start practicing to build your history!
              </CardContent>
            </Card>
          )}
          {tests.map(test => (
            <Card
              key={test.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate(`/test-results/${test.id}`)}
            >
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium text-sm truncate">{test.title || 'Untitled Test'}</p>
                      {test.group_test_id && (
                        <Badge variant="secondary" className="text-[10px] shrink-0">Group</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {test.completed_at
                          ? new Date(test.completed_at).toLocaleDateString('en-IN', {
                              day: '2-digit', month: 'short', year: '2-digit'
                            })
                          : '-'}
                      </span>
                      <span>{test.correct_answers || 0}/{test.total_questions || 0} correct</span>
                      <span>{formatTime(test.time_taken || 0)}</span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className={`text-lg font-bold ${
                      (test.score || 0) >= 70 ? 'text-green-600' :
                      (test.score || 0) >= 40 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {test.score || 0}%
                    </div>
                    <div className="text-[10px] text-muted-foreground">score</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 mt-6">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default TestHistoryPage;
