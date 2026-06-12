import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { logger } from '@/utils/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PasswordStrength } from '@/components/ui/password-strength';
import SEOHead from '@/components/SEOHead';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  
  const navigate = useNavigate();
  const { updatePassword } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    let cancelled = false;

    const handleRecoveryToken = async () => {
      const hash = window.location.hash;
      
      if (hash && hash.includes('type=recovery')) {
        try {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');
          
          if (accessToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            });
            
            if (cancelled) return;

            if (error) {
              logger.error('[ResetPassword] Session error:', error);
              setSessionError('Recovery link expired or invalid. Please request a new one.');
            } else {
              logger.info('[ResetPassword] Recovery session established');
              setSessionReady(true);
              window.history.replaceState(null, '', window.location.pathname);
            }
          } else {
            setSessionError('Invalid recovery link. Please request a new reset email.');
          }
        } catch (err) {
          if (cancelled) return;
          logger.error('[ResetPassword] Error processing recovery token:', err);
          setSessionError('Something went wrong. Please try again.');
        }
      } else {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (session) {
          setSessionReady(true);
        } else {
          setSessionError('No recovery session found. Please use the reset link from your email.');
        }
      }
    };

    void handleRecoveryToken();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({ title: "Passwords don't match", description: "Please make sure both passwords are the same", variant: "destructive" });
      return;
    }

    if (newPassword.length < 8) {
      toast({ title: "Password too short", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword)) {
      toast({ title: "Password too weak", description: "Password must contain uppercase, lowercase, and a number", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    
    const result = await updatePassword(newPassword);
    
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      setIsLoading(false);
    } else {
      toast({ title: "Password Updated! ✅", description: "Your password has been successfully reset. Redirecting..." });
      setIsLoading(false);
      setTimeout(() => navigate('/dashboard'), 2000);
    }
  };

  return (
    <div className="mobile-app-shell-header-only flex flex-col bg-background overflow-hidden">
      <SEOHead
        title="Reset Password"
        description="Set a new password for your JEEnie AI account."
        canonical="https://www.jeenie.website/reset-password"
        noIndex
      />
      <Header />
      
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 overflow-y-auto">
        <Card className="w-full max-w-md border-border shadow-xl my-4">
          <CardHeader className="text-center space-y-1 pb-4 pt-5">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
              Reset Password
            </CardTitle>
            <p className="text-muted-foreground">
              {sessionError ? 'Session expired' : sessionReady ? 'Enter your new password' : 'Verifying reset link...'}
            </p>
          </CardHeader>
          
          <CardContent>
            {!sessionReady && !sessionError && (
              <div className="flex flex-col items-center justify-center py-10 gap-4 text-center">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-primary/15 blur-xl animate-pulse" />
                  <img src="/logo.png" alt="JEEnie logo" className="relative h-14 w-14 rounded-2xl shadow-lg" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">JEEnie Loading</p>
                  <p className="text-lg font-bold text-primary">Ruko Zara! JEEnie ready ho raha hai</p>
                  <p className="text-muted-foreground">Processing your reset link...</p>
                </div>
              </div>
            )}

            {sessionError && (
              <div className="flex flex-col items-center justify-center py-4 gap-4">
                <p className="text-destructive text-center">{sessionError}</p>
                <Button onClick={() => navigate('/forgot-password')} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                  Request New Reset Link
                </Button>
              </div>
            )}

            {sessionReady && (
              <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="newPassword" className="text-primary">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input id="newPassword" type={showPassword ? "text" : "password"} placeholder="Enter new password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="pl-10 pr-10 border-input focus:border-primary" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <PasswordStrength password={newPassword} className="-mt-1" />

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="text-primary">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <Input id="confirmPassword" type={showConfirmPassword ? "text" : "password"} placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="pl-10 pr-10 border-input focus:border-primary" required />
                  <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary">
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 text-lg font-semibold" disabled={isLoading}>
                {isLoading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;
