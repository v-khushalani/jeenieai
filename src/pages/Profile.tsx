import { useState, useEffect } from 'react';
import ReferralCard from '@/components/ReferralCard';
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { getSubjects, normalizeTargetExam } from '@/config/goalConfig';
import { 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  GraduationCap, 
  Target, 
  Calendar,
  Trophy,
  BookOpen,
  Clock,
  Edit,
  Save,
  Loader2,
  Flame,
  Star,
  Settings
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import PointsService from '@/services/pointsService';
import { logger } from '@/utils/logger';

const Profile = () => {
  const { user, isAuthenticated, isPremium, isProPlus } = useAuth();
  const referralEnabled = useFeatureFlag('referral_system');
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingGoal, setEditingGoal] = useState(false);
  const [dailyGoal, setDailyGoal] = useState(15);
  const [savingGoal, setSavingGoal] = useState(false);
  const [pointsLevel, setPointsLevel] = useState({ name: 'BEGINNER', points: 0, pointsToNext: 100 });
  const navigate = useNavigate();
  const { toast } = useToast();
  const targetExam = normalizeTargetExam(profile?.target_exam);
  const displaySubjects = profile?.subjects?.length ? profile.subjects : getSubjects(targetExam);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    
    loadProfileData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user]);

  const loadProfileData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load profile data
      const { data: profileData, error: profileError } = await supabase
        .from('my_profile' as any)
        .select('*')
        .maybeSingle();

      if (profileError) {
        logger.error('Profile error:', profileError);
        toast({
          title: "Error",
          description: "Failed to load profile data",
          variant: "destructive"
        });
        return;
      }

      const p: any = profileData as any;
      setProfile(p);
      setDailyGoal(p?.daily_goal || 15);

      // Load points and level
      const pointsData = await PointsService.getUserPoints(user.id);
      setPointsLevel({
        name: pointsData.level,
        points: pointsData.totalPoints,
        pointsToNext: pointsData.levelInfo.pointsToNext
      });

      // Source of truth = question_attempts table (exclude test attempts so
      // tests don't drag down practice accuracy / streak metrics).
      const { count: attemptsCount } = await supabase
        .from('question_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .neq('mode', 'test');

      const { count: correctCount } = await supabase
        .from('question_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .neq('mode', 'test')
        .eq('is_correct', true);

      const totalAttempts = attemptsCount || 0;
      const totalCorrect = correctCount || 0;
      const computedAccuracy = totalAttempts > 0
        ? Math.round((totalCorrect / totalAttempts) * 1000) / 10
        : 0;

      setStats({
        total_questions: totalAttempts,
        correct_answers: totalCorrect,
        accuracy: computedAccuracy,
        streak: p?.current_streak || 0,
        total_points: p?.total_points || 0,
        longest_streak: p?.longest_streak || 0
      });

    } catch (error) {
      logger.error('Error loading profile:', error);
      toast({
        title: "Error",
        description: "Failed to load profile data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDailyGoal = async () => {
    if (!user?.id) return;
    
    setSavingGoal(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ daily_goal: dailyGoal, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;

      setProfile({ ...profile, daily_goal: dailyGoal });
      setEditingGoal(false);
      toast({
        title: "Success!",
        description: `Daily goal updated to ${dailyGoal} questions`,
      });
    } catch (error) {
      logger.error('Error saving daily goal:', error);
      toast({
        title: "Error",
        description: "Failed to save daily goal",
        variant: "destructive"
      });
    } finally {
      setSavingGoal(false);
    }
  };

  if (loading) {
    return <LoadingScreen pageName="Profile" message="Loading your profile..." />;
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const getGradeDisplay = (grade: number) => {
    if (grade === 11) return '11th Grade';
    if (grade === 12) return '12th Grade';
    if (grade >= 6 && grade <= 10) return `${grade}th Grade`;
    return '12th Pass';
  };

  return (
    <div className="mobile-app-shell bg-linear-to-b from-blue-50 via-background to-indigo-50/70 dark:from-slate-950 dark:via-background dark:to-slate-900">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[420px] h-[420px] bg-blue-200 rounded-full -translate-y-1/2 translate-x-1/3 opacity-35 dark:bg-blue-900/25" />
        <div className="absolute bottom-0 left-0 w-[320px] h-[320px] bg-indigo-200 rounded-full translate-y-1/2 -translate-x-1/3 opacity-35 dark:bg-indigo-900/25" />
      </div>
      <Header />
      <div className="relative z-10 h-full min-h-0 overflow-y-auto py-4 sm:py-6">
        <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-4xl">
          <div className="mb-3 md:mb-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-primary/70 font-semibold">Learner Profile</p>
          </div>
          
          {/* Profile Header */}
          <Card className="mb-4 md:mb-6 border border-primary/20 shadow-xl bg-linear-to-r from-white via-blue-50/70 to-indigo-50/70 backdrop-blur-sm dark:from-slate-900/95 dark:via-slate-900/85 dark:to-slate-800/80 dark:border-primary/30">
            <CardContent className="pt-4 md:pt-6 px-3 md:px-6">
              <div className="flex flex-col items-center gap-4 md:gap-6">
                {/* Avatar */}
                <div className="relative">
                  <Avatar className="w-20 h-20 md:w-24 md:h-24 ring-4 ring-white shadow-lg dark:ring-slate-700">
                    <AvatarImage src={profile?.avatar_url} alt={profile?.full_name} />
                    <AvatarFallback className="text-lg md:text-xl font-bold bg-primary text-primary-foreground">
                      {getInitials(profile?.full_name || 'User')}
                    </AvatarFallback>
                  </Avatar>
                  {isPremium && (
                    <div className="absolute -bottom-1 -right-1 bg-linear-to-r from-yellow-400 to-orange-500 rounded-full p-1">
                      <Star className="w-3 h-3 md:w-4 md:h-4 text-white fill-white" />
                    </div>
                  )}
                </div>
                
                {/* Name & Info */}
                <div className="flex-1 text-center w-full">
                  <div className="flex items-center justify-center gap-2 mb-1 md:mb-2">
                    <h1 className="text-xl md:text-3xl font-bold text-primary">
                      {profile?.full_name || 'Student'}
                    </h1>
                    {isPremium && (
                      <Badge className="bg-linear-to-r from-yellow-400 to-orange-500 text-white border-0 text-[10px] md:text-xs">
                        PRO
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground text-sm md:text-base mb-3 md:mb-4 truncate max-w-full">{profile?.email}</p>
                  
                  <div className="flex flex-wrap gap-1.5 md:gap-2 justify-center mb-4">
                    <Badge variant="secondary" className="flex items-center gap-1 text-[10px] md:text-xs bg-secondary text-secondary-foreground">
                      <GraduationCap className="w-2.5 h-2.5 md:w-3 md:h-3" />
                      {getGradeDisplay(profile?.grade)}
                    </Badge>
                    <Badge variant="secondary" className="flex items-center gap-1 text-[10px] md:text-xs bg-secondary text-secondary-foreground">
                      <Target className="w-2.5 h-2.5 md:w-3 md:h-3" />
                      {profile?.target_exam || 'Not Set'}
                    </Badge>
                    {profile?.city && (
                      <Badge variant="outline" className="flex items-center gap-1 text-[10px] md:text-xs">
                        <MapPin className="w-2.5 h-2.5 md:w-3 md:h-3" />
                        {profile.city}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex gap-2 w-full sm:w-auto">
                  <Button 
                    onClick={() => navigate('/settings')}
                    variant="outline"
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 md:gap-2 text-xs md:text-sm h-9 md:h-10"
                  >
                    <Settings className="w-3 h-3 md:w-4 md:h-4" />
                    Settings
                  </Button>
                  <Button 
                    onClick={() => navigate('/settings')}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1 md:gap-2 text-xs md:text-sm h-9 md:h-10 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Edit className="w-3 h-3 md:w-4 md:h-4" />
                    Edit Profile
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-6">
            {/* Personal Information */}
            <Card className="border border-primary/15 shadow-md bg-white/90 backdrop-blur-sm dark:bg-slate-900/80 dark:border-primary/30">
              <CardHeader className="pb-2 md:pb-4 px-3 md:px-6">
                <CardTitle className="flex items-center gap-2 text-sm md:text-base text-primary">
                  <User className="w-4 h-4 md:w-5 md:h-5" />
                  Personal Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 md:space-y-4 px-3 md:px-6">
                <div className="flex items-center gap-2 md:gap-3">
                  <Mail className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs md:text-sm truncate">{profile?.email}</span>
                </div>
                
                {profile?.phone && (
                  <div className="flex items-center gap-2 md:gap-3">
                    <Phone className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground shrink-0" />
                    <span className="text-xs md:text-sm">{profile.phone}</span>
                  </div>
                )}
                
                {profile?.city && (
                  <div className="flex items-center gap-2 md:gap-3">
                    <MapPin className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground shrink-0" />
                    <span className="text-xs md:text-sm">
                      {profile.city}{profile?.state && `, ${profile.state}`}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center gap-2 md:gap-3">
                  <Calendar className="w-3 h-3 md:w-4 md:h-4 text-muted-foreground shrink-0" />
                  <span className="text-xs md:text-sm">
                    Joined {profile?.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Recently'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Academic Information with Daily Goal */}
            <Card className="border border-primary/15 shadow-md bg-white/90 backdrop-blur-sm dark:bg-slate-900/80 dark:border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <BookOpen className="w-5 h-5" />
                  Academic Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <GraduationCap className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Grade: {getGradeDisplay(profile?.grade)}</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <Target className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">Target: {profile?.target_exam || 'Not Set'}</span>
                </div>
                
                {displaySubjects.length > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-2">Subjects:</p>
                    <div className="flex flex-wrap gap-1">
                      {displaySubjects.map((subject: string) => (
                        <Badge key={subject} variant="outline" className="text-xs">
                          {subject}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Editable Daily Goal */}
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <Label className="text-sm">Daily Goal:</Label>
                    </div>
                    {!editingGoal ? (
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-primary">{dailyGoal} questions</span>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => setEditingGoal(true)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={5}
                          max={100}
                          value={dailyGoal}
                          onChange={(e) => setDailyGoal(Math.max(5, Math.min(100, parseInt(e.target.value) || 15)))}
                          className="w-20 h-8"
                        />
                        <Button 
                          size="sm" 
                          onClick={handleSaveDailyGoal}
                          disabled={savingGoal}
                          className="h-8 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {savingGoal ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => {
                            setEditingGoal(false);
                            setDailyGoal(profile?.daily_goal || 15);
                          }}
                          className="h-8"
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Set between 5-100 questions per day</p>
                </div>
              </CardContent>
            </Card>

            {/* JEEnie Points & Level */}
            <Card className="border border-primary/15 shadow-md bg-white/90 backdrop-blur-sm dark:bg-slate-900/80 dark:border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Star className="w-5 h-5" />
                  JEEnie Points
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center p-4 rounded-lg bg-secondary dark:bg-slate-800/80">
                  <div className="text-4xl font-bold mb-2 text-primary">
                    {pointsLevel.points.toLocaleString()}
                  </div>
                  <Badge className="mb-2 bg-primary text-primary-foreground">
                    {pointsLevel.name}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {pointsLevel.pointsToNext > 0 
                      ? `${pointsLevel.pointsToNext} points to next level`
                      : 'Maximum level reached!'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Streak Info */}
            <Card className="border border-primary/15 shadow-md bg-white/90 backdrop-blur-sm dark:bg-slate-900/80 dark:border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Flame className="w-5 h-5" />
                  Streak Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-orange-50 rounded-lg dark:bg-orange-950/30">
                    <div className="text-3xl font-bold text-orange-600">{stats?.streak || 0}</div>
                    <div className="text-sm text-muted-foreground">Current Streak</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-lg dark:bg-red-950/30">
                    <div className="text-3xl font-bold text-red-600">{stats?.longest_streak || 0}</div>
                    <div className="text-sm text-muted-foreground">Best Streak</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Stats */}
            {stats && (
              <Card className="md:col-span-2 border border-primary/15 shadow-md bg-white/90 backdrop-blur-sm dark:bg-slate-900/80 dark:border-primary/30">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-primary">
                    <Trophy className="w-5 h-5" />
                    Performance Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 rounded-lg bg-secondary dark:bg-slate-800/80">
                      <div className="text-2xl font-bold text-primary">{stats.total_questions || 0}</div>
                      <div className="text-sm text-muted-foreground">Questions Solved</div>
                    </div>
                    
                    <div className="text-center p-4 bg-green-50 rounded-lg dark:bg-green-950/30">
                      <div className="text-2xl font-bold text-green-600">{stats.correct_answers || 0}</div>
                      <div className="text-sm text-muted-foreground">Correct Answers</div>
                    </div>
                    
                    <div className="text-center p-4 bg-purple-50 rounded-lg dark:bg-purple-950/30">
                      <div className="text-2xl font-bold text-purple-600">{stats.accuracy || 0}%</div>
                      <div className="text-sm text-muted-foreground">Accuracy</div>
                    </div>
                    
                    <div className="text-center p-4 bg-yellow-50 rounded-lg dark:bg-yellow-950/30">
                      <div className="text-2xl font-bold text-yellow-600">{stats.total_points || 0}</div>
                      <div className="text-sm text-muted-foreground">Total Points</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Referral Card */}
            {referralEnabled && <ReferralCard />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;