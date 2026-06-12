import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, ArrowLeft } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import Header from '@/components/Header';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import SEOHead from '@/components/SEOHead';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  
  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);
  
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const { toast } = useToast();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({ title: "Email required", description: "Please enter a valid email address", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    
    const result = await resetPassword(email.trim());
    
    if (result.error) {
      toast({ title: "Error", description: result.error, variant: "destructive" });
      setIsLoading(false);
    } else {
      setEmailSent(true);
      setCooldown(60);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = setInterval(() => {
        setCooldown(prev => {
          if (prev <= 1) { clearInterval(cooldownRef.current!); return 0; }
          return prev - 1;
        });
      }, 1000);
      toast({ title: "Email Sent! 📧", description: "Check your inbox for password reset instructions" });
      setIsLoading(false);
    }
  };

  return (
    <div className="mobile-app-shell-header-only flex flex-col bg-background overflow-hidden">
      <SEOHead
        title="Forgot Password"
        description="Reset your JEEnie AI account password securely."
        canonical="https://www.jeenie.website/forgot-password"
        noIndex
      />
      <Header />
      
      <div className="flex-1 min-h-0 flex items-center justify-center px-4 overflow-y-auto">
        <Card className="w-full max-w-md border-border shadow-xl my-4">
          <CardHeader className="text-center space-y-1 pb-4 pt-5">
            <CardTitle className="text-2xl sm:text-3xl font-bold text-primary">
              Forgot Password?
            </CardTitle>
            <p className="text-muted-foreground">
              {emailSent 
                ? "We've sent you a reset link" 
                : "Enter your email to reset your password"}
            </p>
          </CardHeader>
          
          <CardContent>
            {!emailSent ? (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-primary">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="your.email@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 border-input focus:border-primary"
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 text-lg font-semibold"
                  disabled={isLoading || cooldown > 0}
                >
                  {isLoading ? 'Sending...' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Reset Link'}
                </Button>
              </form>
            ) : (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto">
                  <Mail className="w-8 h-8 text-green-600" />
                </div>
                <p className="text-foreground/80">
                  We've sent a password reset link to <strong>{email}</strong>
                </p>
                <p className="text-sm text-muted-foreground">
                  Please check your inbox and follow the instructions to reset your password.
                </p>
                <Button
                  onClick={() => navigate('/login')}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-6 text-lg font-semibold mt-4"
                >
                  Back to Login
                </Button>
              </div>
            )}

            {!emailSent && (
              <div className="mt-6 text-center">
                <Link 
                  to="/login" 
                  className="text-primary font-semibold hover:underline inline-flex items-center"
                >
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  Back to Login
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
