import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import safeLocalStorage from '@/utils/safeStorage';
import { 
  User, Bell, Shield, Palette, LogOut, Save, Loader2, AlertCircle, CheckCircle,
  Heart, Sparkles, Download, Lock, Eye, EyeOff, AlertTriangle
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import LoadingScreen from '@/components/ui/LoadingScreen';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logger } from "@/utils/logger";
// GoalChangeWarning removed — goal changes are no longer allowed

const Settings = () => {
  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    city: '',
    state: '',
    grade: '',
    target_exam: '',
    daily_goal: 15,
    smart_goal_enabled: true
  });

  // Notification preferences — placeholder state (not persisted to DB yet)
  const [notifications, setNotifications] = useState({
    email: true,
    push: true,
    studyReminders: true,
    achievements: true
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [user, setUser] = useState<any>(null);
  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false);
  const [showFarewellDialog, setShowFarewellDialog] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [theme, setTheme] = useState('light');
  
  // Goal change is no longer allowed — these dead state vars removed

  const { signOut, isPremium } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const foundationGrades = new Set(['6th', '7th', '8th', '9th', '10th']);
  const isFoundationGrade = (gradeValue: string) => foundationGrades.has(gradeValue);
  const isCompetitiveExam = (examValue: string) => ['JEE', 'NEET', 'MH_CET', 'MH-CET'].includes(examValue);
  const normalizeGradeExamPair = (
    nextProfile: typeof profile,
    changedField: 'grade' | 'target_exam'
  ) => {
    let nextGrade = nextProfile.grade;
    let nextExam = nextProfile.target_exam;

    if (changedField === 'grade') {
      const nextGradeNumber = nextGrade === '11th' ? 11 :
        nextGrade === '12th' ? 12 :
        nextGrade === '12th-pass' ? 13 :
        parseInt(nextGrade) || 12;

      if (isCompetitiveExam(nextExam) && nextGradeNumber < 11) {
        nextExam = 'Foundation';
      }

      if (nextExam === 'Scholarship' && nextGradeNumber > 10) {
        nextExam = 'Foundation';
      }

      if (nextExam === 'Foundation' && (nextGradeNumber < 6 || nextGradeNumber > 10)) {
        nextGrade = '10th';
      }
    }

    if (changedField === 'target_exam') {
      if (nextExam === 'Foundation' && !isFoundationGrade(nextGrade)) {
        nextGrade = '10th';
      }

      if (nextExam === 'Scholarship' && !isFoundationGrade(nextGrade)) {
        nextGrade = '9th';
      }

      if (isCompetitiveExam(nextExam) && isFoundationGrade(nextGrade)) {
        nextGrade = '11th';
      }
    }

    return { ...nextProfile, grade: nextGrade, target_exam: nextExam };
  };

  useEffect(() => {
    loadUserProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadUserProfile = async () => {
    try {
      setLoading(true);
      
      const { data: { user: currentUser }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !currentUser) {
        logger.error('Authentication error:', authError);
        toast({
          title: "Authentication Error",
          description: "Please login again",
          variant: "destructive"
        });
        navigate('/login');
        return;
      }

      setUser(currentUser);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (profileError) {
        logger.error('Profile loading error:', profileError);
        const userMeta = currentUser.user_metadata || {};
        setProfile({
          firstName: userMeta.firstName || currentUser.email?.split('@')[0] || '',
          lastName: userMeta.lastName || '',
          email: currentUser.email || '',
          phone: userMeta.phone || '',
          city: userMeta.city || '',
          state: userMeta.state || '',
          grade: userMeta.grade || '12th',
          target_exam: userMeta.target_exam || 'JEE',
          daily_goal: 15,
          smart_goal_enabled: true
        });
      } else {
        const nameParts = profileData.full_name?.split(' ') || ['', ''];
        // Normalize target_exam for display - show "Foundation" in UI even if stored as "Foundation-9"
        let displayExam = profileData.target_exam || 'JEE';
        if (displayExam.startsWith('Foundation-')) {
          displayExam = 'Foundation';
        }
        setProfile({
          firstName: nameParts[0] || '',
          lastName: nameParts.slice(1).join(' ') || '',
          email: profileData.email || currentUser.email || '',
          phone: profileData.phone || '',
          city: profileData.city || '',
          state: profileData.state || '',
          grade: profileData.grade === 11 ? '11th' : 
                 profileData.grade === 12 ? '12th' : 
                 profileData.grade >= 6 && profileData.grade <= 10 ? `${profileData.grade}th` :
                 '12th-pass',
          target_exam: displayExam,
          daily_goal: profileData.daily_goal || 15,
          smart_goal_enabled: (profileData as any).smart_goal_enabled ?? true
        });
        
        // Goal change detection removed — goals are locked
      }

      logger.info('Profile loaded successfully');
      
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

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      setSaveStatus('idle');

      if (!user) {
        throw new Error('User not authenticated');
      }

      if (!profile.firstName.trim() || !profile.email.trim()) {
        toast({
          title: "Validation Error",
          description: "First name and email are required",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      const rawPhone = profile.phone?.trim() || '';
      const normalizedPhone = rawPhone.replace(/[\s-]/g, '');
      if (!normalizedPhone) {
        toast({
          title: "Phone Required",
          description: "Mobile number is required to protect your account",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      if (!/^\+?\d{10,15}$/.test(normalizedPhone)) {
        toast({
          title: "Invalid Phone",
          description: "Enter a valid mobile number with country code",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      const gradeNumber = profile.grade === '11th' ? 11 : 
                          profile.grade === '12th' ? 12 : 
                          profile.grade === '12th-pass' ? 13 :
                          parseInt(profile.grade) || 12;

      // For Foundation courses, use "Foundation-{grade}" (e.g., "Foundation-9")
      // For JEE/NEET, use as-is
      let targetExamValue = profile.target_exam;
      if (profile.target_exam === 'Foundation' && gradeNumber >= 6 && gradeNumber <= 10) {
        targetExamValue = `Foundation-${gradeNumber}`;
      }

      const isFoundationExam = targetExamValue.startsWith('Foundation');
      const isCompetitive = ['JEE', 'NEET', 'MH_CET', 'MH-CET'].includes(targetExamValue);

      if (isCompetitive && gradeNumber < 11) {
        toast({
          title: "Grade Mismatch",
          description: "JEE/NEET is only for Class 11 or higher",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      if (isFoundationExam && (gradeNumber < 6 || gradeNumber > 10)) {
        toast({
          title: "Grade Mismatch",
          description: "Foundation is only for Class 6 to 10",
          variant: "destructive"
        });
        setSaving(false);
        return;
      }

      // Goal/grade changes are no longer allowed - skip goal change check
      // Proceed with normal save (only non-goal fields can change)
      await performProfileSave(gradeNumber, targetExamValue, normalizedPhone);
      
    } catch (error: any) {
      logger.error('Error saving profile:', error);
      setSaveStatus('error');
      toast({
        title: "Save Failed",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
      setTimeout(() => setSaveStatus('idle'), 5000);
    } finally {
      setSaving(false);
    }
  };

  const performProfileSave = async (gradeNumber: number, targetExamValue: string, phoneValue: string) => {
    if (!user) return;

    const selectedGoalValue =
      targetExamValue === 'JEE' ? 'jee' :
      targetExamValue === 'NEET' ? 'neet' :
      targetExamValue === 'MH_CET' || targetExamValue === 'MH-CET' ? 'mh_cet' :
      'boards';

    try {
      // Don't send grade/target_exam — they're locked after initial selection
      const updateData = {
        full_name: `${profile.firstName.trim()} ${profile.lastName.trim()}`.trim(),
        email: profile.email.trim(),
        phone: phoneValue,
        city: profile.city?.trim() || null,
        state: profile.state?.trim() || null,
        daily_goal: profile.daily_goal,
        smart_goal_enabled: profile.smart_goal_enabled,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('id', user.id);

      if (error) throw error;

      // daily_progress sync removed — streak logic uses question_attempts directly

      setSaveStatus('success');
      toast({
        title: "Success!",
        description: "Profile updated successfully",
      });
      
      setTimeout(() => setSaveStatus('idle'), 3000);

    } catch (error: any) {
      logger.error('Error saving profile:', error);
      setSaveStatus('error');
      toast({
        title: "Save Failed",
        description: error.message || "Failed to update profile",
        variant: "destructive"
      });
      setTimeout(() => setSaveStatus('idle'), 5000);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      safeLocalStorage.clear();
      sessionStorage.clear();
      
      toast({
        title: "Signed Out",
        description: "You have been signed out successfully",
      });
      
      navigate('/login');
      
    } catch (error) {
      logger.error('Sign out failed:', error);
      toast({
        title: "Error",
        description: "Failed to sign out",
        variant: "destructive"
      });
    }
  };

  const handleDeactivateAccount = async () => {
    setDeactivating(true);
    
    try {
      // Delete the profile — the handle_profile_deleted trigger will cascade to auth.users
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', user.id);

      if (error) throw error;

      setShowDeactivateDialog(false);
      setShowFarewellDialog(true);
      
    } catch (error) {
      logger.error('Error deactivating account:', error);
      toast({
        title: "Error",
        description: "Failed to deactivate account. Please try again.",
        variant: "destructive"
      });
    } finally {
      setDeactivating(false);
    }
  };

  const handleFarewellClose = async () => {
    setShowFarewellDialog(false);
    await signOut();
    safeLocalStorage.clear();
    sessionStorage.clear();
    navigate('/');
  };

  const handleExportData = async () => {
    try {
      toast({
        title: "Preparing your data...",
        description: "This may take a moment",
      });

      // Fetch all user data
      const [profileRes, attemptsRes, sessionsRes] = await Promise.all([
        supabase.from('my_profile' as any).select('*').maybeSingle(),
        supabase.from('question_attempts').select('*').eq('user_id', user.id),
        supabase.from('test_sessions').select('*').eq('user_id', user.id)
      ]);

      const exportData = {
        exported_at: new Date().toISOString(),
        profile: profileRes.data,
        question_attempts: attemptsRes.data,
        test_sessions: sessionsRes.data
      };

      // Download as JSON
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `jeenie-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Download Started!",
        description: "Your data export has been downloaded",
      });
    } catch (error) {
      logger.error('Export error:', error);
      toast({
        title: "Export Failed",
        description: "Failed to export your data",
        variant: "destructive"
      });
    }
  };

  const handleInputChange = (field: keyof typeof profile, value: any) => {
    setProfile(prev => {
      const nextProfile = { ...prev, [field]: value };
      if (field === 'grade' || field === 'target_exam') {
        return normalizeGradeExamPair(nextProfile, field);
      }
      return nextProfile;
    });
    if (saveStatus !== 'idle') setSaveStatus('idle');
  };

  if (loading) {
    return <LoadingScreen pageName="Settings" message="Loading your settings..." />;
  }

  return (
    <div className="mobile-app-shell bg-linear-to-b from-slate-50 via-background to-slate-100/70 dark:from-slate-950 dark:via-background dark:to-slate-900">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-[380px] h-[380px] bg-slate-200 rounded-full -translate-y-1/2 translate-x-1/3 opacity-40 dark:bg-slate-700/30" />
        <div className="absolute bottom-0 left-0 w-[340px] h-[340px] bg-cyan-100 rounded-full translate-y-1/2 -translate-x-1/3 opacity-35 dark:bg-cyan-900/20" />
      </div>
      <Header />
      <div className="relative z-10 h-full min-h-0 overflow-y-auto py-4 sm:py-6">
        <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-4xl">

          <div className="mb-3 md:mb-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">App Controls</p>
          </div>

          <div className="space-y-4 md:space-y-6">
            {/* Profile Settings */}
            <Card className="border border-slate-300 shadow-xs bg-white/95 dark:bg-slate-900/85 dark:border-slate-700">
              <CardHeader className="pb-2 md:pb-4 px-3 md:px-6">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center text-sm md:text-base text-primary">
                    <User className="w-4 h-4 md:w-5 md:h-5 mr-2" />
                    Profile Information
                  </CardTitle>
                  {saveStatus === 'success' && (
                    <div className="flex items-center text-green-600 text-xs md:text-sm">
                      <CheckCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                      Saved!
                    </div>
                  )}
                  {saveStatus === 'error' && (
                    <div className="flex items-center text-red-600 text-xs md:text-sm">
                      <AlertCircle className="w-3 h-3 md:w-4 md:h-4 mr-1" />
                      Failed
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 md:space-y-4 px-3 md:px-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input
                      id="firstName"
                      value={profile.firstName}
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      placeholder="Enter your first name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={profile.lastName}
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      placeholder="Enter your last name"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profile.email}
                    disabled
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">Email cannot be changed</p>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number *</Label>
                    <Input
                      id="phone"
                      value={profile.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
                      placeholder="+91 9876543210"
                    />
                    <p className="text-xs text-muted-foreground">Required for account protection</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grade">Current Grade</Label>
                    <select
                      id="grade"
                      value={profile.grade}
                      disabled
                      className="w-full h-10 px-3 rounded-md border border-input bg-muted text-sm cursor-not-allowed"
                    >
                      <option value="">Select Grade</option>
                      <option value="6th">6th Grade</option>
                      <option value="7th">7th Grade</option>
                      <option value="8th">8th Grade</option>
                      <option value="9th">9th Grade</option>
                      <option value="10th">10th Grade</option>
                      <option value="11th">11th Grade</option>
                      <option value="12th">12th Grade</option>
                      <option value="12th-pass">12th Pass (Dropper)</option>
                    </select>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Grade is locked after initial selection
                    </p>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={profile.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                      placeholder="Mumbai"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={profile.state}
                      onChange={(e) => handleInputChange('state', e.target.value)}
                      placeholder="Maharashtra"
                    />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="target_exam">Target Exam</Label>
                    <select
                      id="target_exam"
                      value={profile.target_exam}
                      disabled
                      className="w-full h-10 px-3 rounded-md border border-input bg-muted text-sm cursor-not-allowed"
                    >
                      <optgroup label="Competitive Exams">
                        <option value="JEE">JEE (PCM)</option>
                        <option value="NEET">NEET (PCB)</option>
                        <option value="MH_CET">MHT-CET (PCM)</option>
                      </optgroup>
                      <optgroup label="Pre-Foundation">
                        <option value="Foundation">Pre-Foundation (Class 6-10)</option>
                      </optgroup>
                    </select>
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Target exam is locked after initial selection
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="daily_goal">Daily Question Goal</Label>
                    <Input
                      id="daily_goal"
                      type="number"
                      min={5}
                      max={100}
                      value={profile.daily_goal}
                      onChange={(e) => handleInputChange('daily_goal', parseInt(e.target.value) || 15)}
                    />
                    <p className="text-xs text-muted-foreground">Questions to solve daily (5-100)</p>
                  </div>
                </div>

                {/* Smart Goal Toggle */}
                <div className="flex items-center justify-between gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200 dark:bg-blue-950/25 dark:border-blue-800/60">
                  <div className="flex-1 min-w-0">
                    <Label className="flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                      Smart Goal
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {profile.smart_goal_enabled
                        ? 'System may raise your goal above your set target based on your performance'
                        : 'Your daily goal is fixed at the value you set above'}
                    </p>
                  </div>
                  <Switch
                    checked={profile.smart_goal_enabled}
                    onCheckedChange={(checked) => handleInputChange('smart_goal_enabled', checked)}
                  />
                </div>

                <div className="flex items-center gap-4 pt-4">
                  <Button 
                    onClick={handleSaveProfile} 
                    disabled={saving || !profile.firstName || !profile.email}
                    className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Changes
                      </>
                    )}
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    onClick={loadUserProfile}
                    disabled={loading || saving}
                  >
                    Reset Changes
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Notification Settings — coming soon */}
            <Card className="border border-slate-300 shadow-xs bg-white/95 opacity-80 dark:bg-slate-900/75 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-primary">
                  <Bell className="w-5 h-5 mr-2" />
                  Notifications
                  <Badge variant="secondary" className="ml-2 text-xs">Coming Soon</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <p className="text-sm text-muted-foreground">
                  Notification preferences will be available soon. Push notifications for study reminders and achievements are on the way!
                </p>
              </CardContent>
            </Card>

            {/* Privacy & Security */}
            <Card className="border border-slate-300 shadow-xs bg-white/95 dark:bg-slate-900/85 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-primary">
                  <Shield className="w-5 h-5 mr-2" />
                  Privacy & Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-lg bg-secondary">
                  <p className="text-sm mb-2 text-primary">
                    <strong>Account Security:</strong> Your account is secured with Google authentication.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Account created: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'Unknown'}
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={handleExportData} className="flex items-center gap-2">
                    <Download className="w-4 h-4" />
                    Download My Data
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Appearance */}
            <Card className="border border-slate-300 shadow-xs bg-white/95 dark:bg-slate-900/85 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-primary">
                  <Palette className="w-5 h-5 mr-2" />
                  Appearance
                </CardTitle>
              </CardHeader>
              <CardContent className="px-3 sm:px-6">
                <div className="flex items-center justify-between gap-3 p-3 bg-secondary rounded-lg">
                  <div>
                    <Label className="font-medium">Dark Mode</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Switch between light and dark theme
                    </p>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={(checked) => {
                      const newTheme = checked ? 'dark' : 'light';
                      setTheme(newTheme);
                      document.documentElement.classList.toggle('dark', checked);
                      safeLocalStorage.setItem('jeeenie_theme', newTheme);
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Account Actions */}
            <Card className="border border-slate-300 shadow-xs bg-white/95 dark:bg-slate-900/85 dark:border-slate-700">
              <CardHeader>
                <CardTitle className="flex items-center text-red-600">
                  <LogOut className="w-5 h-5 mr-2" />
                  Account Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 px-3 sm:px-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button variant="outline" onClick={handleSignOut} className="flex items-center justify-center gap-2 w-full sm:w-auto">
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </Button>
                  <Button 
                    variant="destructive" 
                    onClick={() => setShowDeactivateDialog(true)}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto"
                  >
                    <Heart className="w-4 h-4" />
                    Deactivate Account
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  This will permanently delete your account and all data. This cannot be undone.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={showDeactivateDialog} onOpenChange={setShowDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Delete Account Permanently?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                We're sad to see you go! 😢
              </p>
              <p className="font-medium text-red-600">
                This action is permanent. Your profile, progress, streaks, and all data will be permanently deleted and cannot be recovered.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay with us 💪</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeactivateAccount}
              disabled={deactivating}
              className="bg-red-500 hover:bg-red-600"
            >
              {deactivating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Farewell Dialog */}
      <AlertDialog open={showFarewellDialog} onOpenChange={() => {}}>
        <AlertDialogContent className="text-center">
          <AlertDialogHeader>
            <div className="flex justify-center mb-4">
              <div className="w-20 h-20 rounded-full flex items-center justify-center bg-secondary">
                <Heart className="w-10 h-10 text-red-400" />
              </div>
            </div>
            <AlertDialogTitle className="text-2xl text-primary">
              Goodbye! 💙
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-4 text-center">
              <p className="text-lg">
                Your account has been deleted.
              </p>
              <p className="text-muted-foreground">
                Every question you solved, every streak you maintained — 
                they all shaped a brilliant mind. We hope JEEnie helped!
              </p>
              <p className="font-medium text-primary">
                We wish you the very best in your future! 🌟
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction 
              onClick={handleFarewellClose}
              className="px-8 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Goodbye for now 👋
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
};

export default Settings;