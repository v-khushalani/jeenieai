import React, { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { ArrowLeft, Download, Copy, Check, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateQRCodeSVG } from '@/utils/qrCode';
import { toast } from '@/hooks/use-toast';
import SEOHead from '@/components/SEOHead';

const INSTALL_URL = 'https://jeenie.website/install';
const SITE_URL = 'https://jeenie.website';

const SharePage: React.FC = () => {
  const navigate = useNavigate();
  const posterRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<null | 'poster' | 'story' | 'square'>(null);

  const qrSvg = useMemo(() => generateQRCodeSVG(INSTALL_URL, 320), []);
  const qrSvgSmall = useMemo(() => generateQRCodeSVG(INSTALL_URL, 220), []);

  const downloadPoster = async () => {
    if (!posterRef.current) return;
    setDownloading('poster');
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
      toast({ title: 'Poster saved!', description: 'Post it on your story or status.' });
    } catch {
      toast({ title: 'Download failed', description: 'Try screenshotting the poster.', variant: 'destructive' });
    } finally {
      setDownloading(null);
    }
  };

  // Canvas-based generator for Instagram Story (1080x1920) & WhatsApp Status (1080x1080)
  const renderCanvasPoster = async (variant: 'story' | 'square'): Promise<string> => {
    const W = 1080;
    const H = variant === 'story' ? 1920 : 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // Gradient bg
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#013062');
    g.addColorStop(1, '#0a4a8f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Cyan glow
    const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 20, W * 0.85, H * 0.1, 700);
    glow.addColorStop(0, 'rgba(34,211,238,0.35)');
    glow.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);

    const glow2 = ctx.createRadialGradient(W * 0.1, H * 0.9, 20, W * 0.1, H * 0.9, 600);
    glow2.addColorStop(0, 'rgba(34,211,238,0.25)');
    glow2.addColorStop(1, 'rgba(34,211,238,0)');
    ctx.fillStyle = glow2; ctx.fillRect(0, 0, W, H);

    const isStory = variant === 'story';
    const cx = W / 2;

    // Logo bubble
    const top = isStory ? 130 : 90;
    const lr = isStory ? 60 : 48;
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath(); ctx.arc(cx, top + lr, lr, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#013062';
    ctx.font = `900 ${Math.round(lr * 1.2)}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('J', cx, top + lr + 4);

    // Brand
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${isStory ? 76 : 60}px Inter, system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    let y = top + lr * 2 + 28;
    ctx.fillText('JEEnie AI', cx, y);
    y += isStory ? 90 : 72;
    ctx.font = `500 ${isStory ? 34 : 26}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(200,220,255,0.9)';
    ctx.fillText('JEE  •  NEET  •  MHT-CET', cx, y);

    // Headline
    y += isStory ? 110 : 60;
    if (isStory) {
      ctx.font = '900 120px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Scan.', cx, y); y += 118;
      ctx.fillText('Install.', cx, y); y += 118;
      ctx.fillStyle = '#22d3ee';
      ctx.fillText('Crack it.', cx, y); y += 145;
    } else {
      ctx.font = '900 88px Inter, system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Scan to install', cx, y); y += 120;
    }

    // QR card
    const qrSize = isStory ? 640 : 420;
    const pad = isStory ? 44 : 32;
    const card = qrSize + pad * 2;
    const cxs = cx - card / 2;
    const cys = y;
    // shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 40; ctx.shadowOffsetY = 20;
    ctx.fillStyle = '#ffffff';
    const r = 40;
    ctx.beginPath();
    ctx.moveTo(cxs + r, cys);
    ctx.arcTo(cxs + card, cys, cxs + card, cys + card, r);
    ctx.arcTo(cxs + card, cys + card, cxs, cys + card, r);
    ctx.arcTo(cxs, cys + card, cxs, cys, r);
    ctx.arcTo(cxs, cys, cxs + card, cys, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Load QR as image
    const qrSvgStr = generateQRCodeSVG(INSTALL_URL, qrSize);
    const qrImg = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      const blob = new Blob([qrSvgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = rej;
      im.src = url;
    });
    ctx.drawImage(qrImg, cxs + pad, cys + pad, qrSize, qrSize);

    y = cys + card + (isStory ? 60 : 35);

    // CTA
    ctx.fillStyle = '#ffffff';
    ctx.font = `800 ${isStory ? 42 : 30}px Inter, system-ui, sans-serif`;
    ctx.fillText('Point camera. Tap link. Install.', cx, y);
    y += isStory ? 65 : 45;
    ctx.fillStyle = '#22d3ee';
    ctx.font = `800 ${isStory ? 40 : 30}px Inter, system-ui, sans-serif`;
    ctx.fillText('jeenie.website/install', cx, y);

    // Bottom accent bar
    ctx.fillStyle = '#22d3ee';
    ctx.fillRect(0, H - 12, W, 12);

    return canvas.toDataURL('image/png');
  };

  const downloadSized = async (variant: 'story' | 'square') => {
    setDownloading(variant);
    try {
      const dataUrl = await renderCanvasPoster(variant);
      const link = document.createElement('a');
      link.download = `jeenie-install-${variant === 'story' ? 'story-1080x1920' : 'square-1080x1080'}.png`;
      link.href = dataUrl;
      link.click();
      toast({
        title: variant === 'story' ? 'Instagram Story poster saved!' : 'WhatsApp Status poster saved!',
        description: 'Ready to post 🚀',
      });
    } catch {
      toast({ title: 'Download failed', variant: 'destructive' });
    } finally {
      setDownloading(null);
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
          text: "India's smartest JEE/NEET prep. Install JEEnie AI:",
          url: INSTALL_URL,
        });
      } catch { /* cancelled */ }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <SEOHead
        title="Share JEEnie AI — Scan QR to Install"
        description="Scan the QR to install JEEnie AI — India's smartest JEE, NEET & MHT-CET prep app. Free to start."
        canonical={`${SITE_URL}/share`}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-20 bg-background/85 backdrop-blur-md border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="text-muted-foreground hover:text-foreground -ml-1 p-1"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-semibold text-foreground">Share JEEnie AI</h1>
        </div>
      </header>

      {/* Scrollable content — leave room for sticky bottom bar */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-40 space-y-5">
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            Download the poster, share it on Instagram Story or WhatsApp Status.
            Friends scan → install directly. No Play Store needed.
          </p>

          {/* Poster preview */}
          <div
            ref={posterRef}
            className="relative rounded-[28px] overflow-hidden mx-auto"
            style={{
              background: 'linear-gradient(160deg, #013062 0%, #0a4a8f 100%)',
              aspectRatio: '9 / 16',
              maxWidth: '320px',
              width: '100%',
              boxShadow: '0 20px 50px -20px rgba(1,48,98,0.6)',
            }}
          >
            <div aria-hidden className="absolute -top-20 -right-20 w-56 h-56 rounded-full opacity-40 blur-3xl" style={{ background: '#22d3ee' }} />
            <div aria-hidden className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full opacity-30 blur-3xl" style={{ background: '#22d3ee' }} />

            <div className="relative h-full flex flex-col items-center justify-between px-5 py-6 text-white text-center">
              {/* Brand */}
              <div className="flex flex-col items-center gap-2">
                <div className="w-11 h-11 rounded-full bg-[#22d3ee] flex items-center justify-center text-[#013062] font-black text-xl">J</div>
                <div className="text-lg font-extrabold tracking-tight">JEEnie AI</div>
                <div className="text-[10px] font-medium text-white/70 tracking-widest">JEE · NEET · MHT-CET</div>
              </div>

              {/* Headline */}
              <div className="leading-none space-y-1">
                <div className="text-[34px] font-black">Scan.</div>
                <div className="text-[34px] font-black">Install.</div>
                <div className="text-[34px] font-black text-[#22d3ee]">Crack it.</div>
              </div>

              {/* QR */}
              <div className="bg-white rounded-2xl p-3 shadow-2xl">
                <div
                  className="w-[170px] h-[170px] [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: qrSvgSmall }}
                />
              </div>

              {/* Footer */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-bold">Point camera. Tap link. Install.</div>
                <div className="text-[11px] font-bold text-[#22d3ee]">jeenie.website/install</div>
              </div>

              <div className="absolute inset-x-0 bottom-0 h-1 bg-[#22d3ee]" />
            </div>
          </div>

          {/* Ready-to-post posters */}
          <div className="space-y-2.5">
            <div className="flex items-center gap-2 pt-2">
              <Sparkles className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">Ready-to-post posters</h2>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                onClick={() => downloadSized('story')}
                disabled={downloading !== null}
                className="group text-left rounded-2xl border border-border bg-card p-3 hover:border-primary/40 transition disabled:opacity-60"
              >
                <div className="aspect-[9/16] rounded-lg mb-2 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: 'linear-gradient(160deg,#013062,#0a4a8f)' }}>
                  <div className="text-center leading-tight">
                    <div>Scan.</div><div>Install.</div><div className="text-[#22d3ee]">Crack it.</div>
                  </div>
                </div>
                <div className="text-xs font-semibold text-foreground">Instagram Story</div>
                <div className="text-[10px] text-muted-foreground">1080 × 1920</div>
              </button>
              <button
                onClick={() => downloadSized('square')}
                disabled={downloading !== null}
                className="group text-left rounded-2xl border border-border bg-card p-3 hover:border-primary/40 transition disabled:opacity-60"
              >
                <div className="aspect-square rounded-lg mb-2 flex items-center justify-center text-white text-[10px] font-bold" style={{ background: 'linear-gradient(160deg,#013062,#0a4a8f)' }}>
                  <div className="text-center leading-tight">Scan to install</div>
                </div>
                <div className="text-xs font-semibold text-foreground">WhatsApp Status</div>
                <div className="text-[10px] text-muted-foreground">1080 × 1080</div>
              </button>
            </div>
            {downloading === 'story' || downloading === 'square' ? (
              <p className="text-[11px] text-center text-muted-foreground">Preparing your poster…</p>
            ) : null}
          </div>

          <p className="text-center text-[11px] text-muted-foreground pt-2">
            Pro tip: post on Instagram Story with a “Link” sticker to{' '}
            <span className="text-foreground font-medium">jeenie.website/install</span> for one-tap install.
          </p>
        </div>
      </main>

      {/* Sticky bottom action bar — always visible */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-background/95 backdrop-blur border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-lg mx-auto px-4 py-3 space-y-2">
          <Button
            onClick={downloadPoster}
            disabled={downloading !== null}
            size="lg"
            className="w-full h-12 gap-2 rounded-xl font-semibold"
          >
            <Download className="w-4 h-4" />
            {downloading === 'poster' ? 'Preparing…' : 'Download this poster'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleNativeShare} variant="secondary" className="h-11 gap-2 rounded-xl">
              <Share2 className="w-4 h-4" />
              Share link
            </Button>
            <Button onClick={handleCopy} variant="secondary" className="h-11 gap-2 rounded-xl">
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharePage;
