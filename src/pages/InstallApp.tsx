import React, { useEffect, useState } from 'react';
import { Download, Check, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import SEOHead from '@/components/SEOHead';
import JsonLd, { breadcrumbSchema } from '@/components/JsonLd';
import { generateQRCodeSVG } from '@/utils/qrCode';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const InstallApp = () => {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua));

    if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
      setIsInstalled(true);
    }

    const existing = (window as any).__jeenieDeferredInstallPrompt;
    if (existing) setDeferredPrompt(existing as BeforeInstallPromptEvent);

    const handler = (e: Event) => {
      e.preventDefault();
      (window as any).__jeenieDeferredInstallPrompt = e;
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      (window as any).__jeenieDeferredInstallPrompt = undefined;
      setDeferredPrompt(null);
      toast({ title: 'Installed!', description: 'JEEnie AI is now on your home screen.' });
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (deferredPrompt) {
      setInstalling(true);
      try {
        await deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        if (outcome === 'accepted') setIsInstalled(true);
        setDeferredPrompt(null);
      } finally {
        setInstalling(false);
      }
      return;
    }

    if (isIOS) {
      toast({
        title: 'Add to Home Screen',
        description: 'Tap the Share button in Safari, then "Add to Home Screen".',
      });
      return;
    }

    toast({
      title: 'Almost there!',
      description:
        'Open your browser menu (⋮) and tap "Install app" or "Add to Home Screen". Tip: visit this page a couple of times so Chrome enables one-tap install.',
    });
  };

  return (
    <div className="mobile-app-shell-bottom-nav bg-background flex flex-col">
      <SEOHead
        title="Install JEEnie AI App"
        description="Install JEEnie AI on Android, iPhone or desktop for instant access and offline study for JEE Main, JEE Advanced and NEET prep."
        canonical="https://www.jeenie.website/install"
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', item: 'https://www.jeenie.website/' },
          { name: 'Install App', item: 'https://www.jeenie.website/install' },
        ])}
      />

      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Install JEEnie AI</h1>
        </div>
      </div>

      <div className="mobile-app-shell-content flex-1 flex items-center justify-center px-4 py-10 max-w-lg mx-auto w-full">
        <div className="w-full space-y-8 text-center">
          <div className="space-y-4">
            <div className="w-24 h-24 mx-auto flex items-center justify-center drop-shadow-xl">
              <img src="/logo.png" alt="JEEnie AI" className="w-24 h-24 rounded-3xl object-cover" />
            </div>
            <div>
              <h2 className="text-3xl font-bold text-foreground">JEEnie AI</h2>
              <p className="text-muted-foreground text-sm mt-2">
                Faster, native experience — works offline.
              </p>
            </div>
          </div>

          {isInstalled ? (
            <Card className="border-primary/20 bg-secondary">
              <CardContent className="p-6 space-y-4">
                <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">Already Installed</h3>
                <Button onClick={() => navigate('/dashboard')} className="w-full">
                  Go to Dashboard
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Button
              onClick={handleInstall}
              size="lg"
              disabled={installing}
              className="w-full h-14 text-base rounded-2xl gap-2 shadow-lg shadow-primary/20"
            >
              <Download className="w-5 h-5" />
              {installing ? 'Installing…' : 'Install App'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstallApp;
