import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Download, FileText, Search, TrendingUp, Target, Clock, Award } from 'lucide-react';
import { logger } from '@/utils/logger';

interface UserReport {
  id: string;
  full_name: string;
  email: string;
  grade?: number;
  target_exam?: string;
  total_questions_solved: number;
  overall_accuracy: number;
  total_study_time: number;
  current_streak: number;
  total_points: number;
  is_premium: boolean;
  created_at: string;
  last_activity_date?: string;
}

export const UserReports: React.FC = () => {
  const [users, setUsers] = useState<UserReport[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [examFilter, setExamFilter] = useState('all');
  const [premiumFilter, setPremiumFilter] = useState('all');

  useEffect(() => {
    loadUserReports();
    
    // Set up real-time subscription for updates
    const channel = supabase
      .channel('admin-reports-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'question_attempts' },
        () => loadUserReports()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => loadUserReports()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    filterUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, searchTerm, examFilter, premiumFilter]);

  const loadUserReports = async () => {
    try {
      // Fetch profiles
      const { data: profilesData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profileError) throw profileError;

      // Fetch all question attempts to compute real stats
      const { data: attemptsData, error: attemptsError } = await supabase
        .from('question_attempts')
        .select('user_id, is_correct, time_spent, created_at');

      if (attemptsError) {
        logger.error('Error fetching attempts:', attemptsError);
      }

      // Group attempts by user and compute stats
      const attemptsByUser = new Map<string, { total: number; correct: number; totalTime: number }>();
      attemptsData?.forEach(attempt => {
        const userId = attempt.user_id;
        if (!attemptsByUser.has(userId)) {
          attemptsByUser.set(userId, { total: 0, correct: 0, totalTime: 0 });
        }
        const userStats = attemptsByUser.get(userId)!;
        userStats.total++;
        if (attempt.is_correct) userStats.correct++;
        userStats.totalTime += (attempt.time_spent || 0);
      });

      // Merge computed stats with profile data
      const usersWithStats = (profilesData || []).map(profile => {
        const computed = attemptsByUser.get(profile.id);
        return {
          ...profile,
          // Use computed values if available, otherwise fall back to stored values
          total_questions_solved: computed?.total || profile.total_questions_solved || 0,
          overall_accuracy: computed && computed.total > 0 
            ? (computed.correct / computed.total) * 100 
            : (profile.overall_accuracy || 0),
          total_study_time: computed?.totalTime 
            ? Math.floor(computed.totalTime / 60) 
            : (profile.total_study_time || 0), // Convert seconds to minutes
        };
      });

      setUsers(usersWithStats);
    } catch (error) {
      logger.error('Error loading user reports:', error);
      toast.error('Failed to load user reports');
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = users;

    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (examFilter !== 'all') {
      filtered = filtered.filter(user => user.target_exam === examFilter);
    }

    if (premiumFilter !== 'all') {
      const isPremium = premiumFilter === 'premium';
      filtered = filtered.filter(user => user.is_premium === isPremium);
    }

    setFilteredUsers(filtered);
  };

  const exportToCSV = () => {
    const headers = [
      'Name',
      'Email',
      'Grade',
      'Target Exam',
      'Questions Solved',
      'Accuracy (%)',
      'Study Time (mins)',
      'Streak',
      'Points',
      'Premium',
      'Joined Date',
      'Last Active'
    ];

    const rows = filteredUsers.map(user => [
      user.full_name || 'N/A',
      user.email,
      user.grade || 'N/A',
      user.target_exam || 'N/A',
      user.total_questions_solved || 0,
      user.overall_accuracy ? user.overall_accuracy.toFixed(2) : '0.00',
      user.total_study_time || 0,
      user.current_streak || 0,
      user.total_points || 0,
      user.is_premium ? 'Yes' : 'No',
      new Date(user.created_at).toLocaleDateString(),
      user.last_activity_date ? new Date(user.last_activity_date).toLocaleDateString() : 'Never'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `user_reports_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success('CSV report exported successfully!');
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-linear-to-br from-blue-50 to-blue-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-blue-700">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">{filteredUsers.length}</div>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-green-50 to-green-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-green-700">Avg Questions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-900">
              {Math.round(
                filteredUsers.reduce((sum, u) => sum + (u.total_questions_solved || 0), 0) / 
                (filteredUsers.length || 1)
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-purple-50 to-purple-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-purple-700">Avg Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-900">
              {(
                filteredUsers.reduce((sum, u) => sum + (u.overall_accuracy || 0), 0) / 
                (filteredUsers.length || 1)
              ).toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card className="bg-linear-to-br from-orange-50 to-orange-100">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-orange-700">Premium Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-900">
              {filteredUsers.filter(u => u.is_premium).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                User Reports & Analytics
              </CardTitle>
              <CardDescription>
                View and export detailed user study patterns and performance metrics
              </CardDescription>
            </div>
            <Button onClick={exportToCSV} className="bg-primary hover:bg-primary/90">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={examFilter} onValueChange={setExamFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by exam" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Exams</SelectItem>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                  COMPETITIVE EXAMS (11-12)
                </div>
                <SelectItem value="JEE">JEE</SelectItem>
                <SelectItem value="NEET">NEET</SelectItem>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground mt-2">
                  SCHOOL COURSES (6-10)
                </div>
                <SelectItem value="Foundation-6">Class 6</SelectItem>
                <SelectItem value="Foundation-7">Class 7</SelectItem>
                <SelectItem value="Foundation-8">Class 8</SelectItem>
                <SelectItem value="Foundation-9">Class 9</SelectItem>
                <SelectItem value="Foundation-10">Class 10</SelectItem>
              </SelectContent>
            </Select>
            <Select value={premiumFilter} onValueChange={setPremiumFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter by tier" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reports Table */}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Target Exam</TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <Target className="h-3 w-3" />
                      Questions
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Accuracy
                    </div>
                  </TableHead>
                   <TableHead>
                    <div className="flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      Points
                    </div>
                  </TableHead>
                  <TableHead>Streak</TableHead>
                  <TableHead>Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No users found matching your criteria
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{user.full_name || 'No name'}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{user.target_exam || 'Not set'}</span>
                      </TableCell>
                      <TableCell className="font-mono">
                        {user.total_questions_solved || 0}
                      </TableCell>
                      <TableCell>
                        <span className={`font-medium ${
                          (user.overall_accuracy || 0) >= 80 ? 'text-green-600' :
                          (user.overall_accuracy || 0) >= 60 ? 'text-yellow-600' :
                          'text-red-600'
                        }`}>
                          {user.overall_accuracy ? user.overall_accuracy.toFixed(1) : '0.0'}%
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">
                        {user.total_points?.toLocaleString() || 0}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{user.current_streak || 0} days</span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {user.last_activity_date
                          ? new Date(user.last_activity_date).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};