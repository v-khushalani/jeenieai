import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { ArrowLeft, Download, Copy, Check, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateQRCodeSVG } from '@/utils/qrCode';
import { toast } from '@/hooks/use-toast';
import SEOHead from '@/components/SEOHead';

const INSTALL_URL = 'https://jeenieai.lovable.app/install';

const SharePage: React.FC = () => {
  const navigate = useNavigate();
  const posterRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const qrSvg = useMemo(() => generateQRCodeSVG(INSTALL_URL, 280), []);

  const handleDownload = async () => {
    if (!posterRef.current) return;
    setDownloading(true);
    try {
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: '#013062',
      });
      const link = document.createElement('a');
      link.download = 'jeenie-install-qr.png';
      link.href = dataUrl;
      link.click();
      toast({ title: 'Poster downloaded!', description: 'Share it on Instagram or WhatsApp.' });
    } catch (err) {
      toast({
        title: 'Download failed',
        description: 'Try taking a screenshot of this page instead.',
        variant: 'destructive',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_URL);
      setCopied(true);
      toast({ title: 'Link copied!', description: INSTALL_URL });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Copy failed', variant: 'destructive' });
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Install JEEnie AI',
          text: 'India\'s smartest JEE/NEET prep — free to start. Install JEEnie AI:',
          url: INSTALL_URL,
        });
      } catch {
        // user cancelled
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SEOHead
        title="Share JEEnie AI — Scan QR to Install"
        description="Scan the QR code to install JEEnie AI — India's smartest JEE, NEET & MHT-CET prep app. Free to start, no Play Store needed."
        canonical="https://www.jeenie.website/share"
      />

      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-foreground">Share JEEnie AI</h1>
        </div>
      </div>

      <div className="flex-1 px-4 py-6 max-w-lg mx-auto w-full space-y-6">
        <p className="text-center text-sm text-muted-foreground">
          Download this poster and share on Instagram story or WhatsApp status.
          Friends scan the QR → install directly, no Play Store needed.
        </p>

        {/* Poster (this is what gets downloaded) */}
        <div
          ref={posterRef}
          className="relative rounded-3xl overflow-hidden shadow-2xl"
          style={{
            background:
              'linear-gradient(160deg, hsl(var(--primary)) 0%, hsl(var(--primary)) 55%, #0a4a8f 100%)',
            aspectRatio: '9 / 16',
            maxWidth: '360px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          {/* Decorative glow */}
          <div
            aria-hidden
            className="absolute -top-24 -right-24 w-64 h-64 rounded-full opacity-30 blur-3xl"
            style={{ background: 'hsl(var(--accent, 210 100% 60%))' }}
          />
          <div
            aria-hidden
            className="absolute -bottom-24 -left-24 w-64 h-64 rounded-full opacity-20 blur-3xl"
            style={{ background: '#22d3ee' }}
          />

          <div className="relative h-full flex flex-col items-center justify-between p-6 text-white text-center">
            {/* Header */}
            <div className="flex flex-col items-center gap-2 mt-2">
              <div className="flex items-center gap-2">
                <img
                  src="/logo.png"
                  alt="JEEnie AI"
                  className="w-10 h-10 rounded-xl object-cover"
                  crossOrigin="anonymous"
                />
                <span className="text-xl font-bold tracking-tight">JEEnie AI</span>
              </div>
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur text-[10px] font-medium uppercase tracking-wider">
                <Sparkles className="w-3 h-3" />
                Free to start
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-1.5">
              <h2 className="text-2xl font-extrabold leading-tight">
                Scan to install
              </h2>
              <p className="text-xs text-white/80 max-w-[240px]">
                India's smartest JEE, NEET &amp; MHT-CET prep — right on your phone
              </p>
            </div>

            {/* QR card */}
            <div className="bg-white rounded-2xl p-3 shadow-xl">
              <div
                className="w-[200px] h-[200px] [&>svg]:w-full [&>svg]:h-full"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
            </div>

            {/* Instructions */}
            <div className="space-y-2 w-full">
              <p className="text-[11px] text-white/90 font-medium">
                📷 Open camera → scan → tap link → Add to Home Screen
              </p>
              <div className="flex items-center justify-center gap-1.5 flex-wrap text-[10px]">
                <span className="px-2 py-0.5 rounded-full bg-white/15">AI Doubt Solver</span>
                <span className="px-2 py-0.5 rounded-full bg-white/15">10k+ PYQs</span>
                <span className="px-2 py-0.5 rounded-full bg-white/15">Free</span>
              </div>
              <p className="text-[10px] text-white/70 pt-1">jeenieai.lovable.app/install</p>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <Button
            onClick={handleDownload}
            disabled={downloading}
            size="lg"
            className="w-full h-12 gap-2 rounded-xl"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Preparing…' : 'Download poster (PNG)'}
          </Button>
          <div className="grid grid-cols-2 gap-2.5">
            <Button
              onClick={handleNativeShare}
              variant="secondary"
              size="lg"
              className="h-12 gap-2 rounded-xl"
            >
              <Share2 className="w-4 h-4" />
              Share link
            </Button>
            <Button
              onClick={handleCopy}
              variant="secondary"
              size="lg"
              className="h-12 gap-2 rounded-xl"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground pt-2 pb-6">
          Tip: Post the poster as an Instagram story with a “Link” sticker to{' '}
          <span className="text-foreground font-medium">{INSTALL_URL}</span> for one-tap install.
        </p>
      </div>
    </div>
  );
};

export default SharePage;
