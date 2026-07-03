import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
import { ArrowLeft, Download, Copy, Check, Share2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { generateQRCodeSVG } from '@/utils/qrCode';
import { toast } from '@/hooks/use-toast';
import SEOHead from '@/components/SEOHead';

const INSTALL_URL = 'https://jeenie.website/install';
const SITE_URL = 'https://jeenie.website';
const LOGO_URL = '/logo.png';

// Brand tokens — mirror src/lib/shareCard.ts exactly
const BRAND = {
  primary: '#013062',
  primary70: 'rgba(1,48,98,0.72)',
  accent: '#e6eeff',
  bgFrom: '#e6eeff',
  bgTo: '#ffffff',
};

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((res, rej) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });

const SharePage: React.FC = () => {
  const navigate = useNavigate();
  const posterRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<null | 'poster' | 'story' | 'square'>(null);
  const [logoReady, setLogoReady] = useState(false);

  const qrSvgSmall = useMemo(() => generateQRCodeSVG(INSTALL_URL, 220), []);

  // Warm the logo so the preview + html-to-image capture it
  useEffect(() => {
    loadImage(LOGO_URL).then(() => setLogoReady(true)).catch(() => setLogoReady(true));
  }, []);

  const downloadPoster = async () => {
    if (!posterRef.current) return;
    setDownloading('poster');
    try {
      const dataUrl = await toPng(posterRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: BRAND.bgTo,
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

  // Canvas generator — Instagram Story (1080x1920) & WhatsApp Status (1080x1080)
  // Matches roast/badge share card aesthetic exactly.
  const renderCanvasPoster = async (variant: 'story' | 'square'): Promise<string> => {
    const W = 1080;
    const H = variant === 'story' ? 1920 : 1080;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // --- Background: light gradient (matches shareCard.ts paintBackground) ---
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, BRAND.bgFrom);
    bg.addColorStop(1, BRAND.bgTo);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Top navy band tint
    const topBand = ctx.createLinearGradient(0, 0, W, 0);
    topBand.addColorStop(0, 'rgba(1,48,98,0.14)');
    topBand.addColorStop(1, 'rgba(1,48,98,0)');
    ctx.fillStyle = topBand;
    ctx.fillRect(0, 0, W, 180);

    // Radial glows
    const g1 = ctx.createRadialGradient(W * 0.84, H * 0.16, 10, W * 0.84, H * 0.16, 460);
    g1.addColorStop(0, 'rgba(1,48,98,0.18)');
    g1.addColorStop(1, 'rgba(1,48,98,0)');
    ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);

    const g2 = ctx.createRadialGradient(W * 0.12, H * 0.92, 5, W * 0.12, H * 0.92, 500);
    g2.addColorStop(0, 'rgba(230,238,255,0.95)');
    g2.addColorStop(1, 'rgba(230,238,255,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);

    // --- Header: real logo + wordmark (top-left) ---
    let logoImg: HTMLImageElement | null = null;
    try { logoImg = await loadImage(LOGO_URL); } catch { /* fallback below */ }

    const logoSize = 88;
    const headX = 60;
    const headY = 60;
    if (logoImg) {
      ctx.drawImage(logoImg, headX, headY, logoSize, logoSize);
    } else {
      // Fallback bubble
      ctx.fillStyle = BRAND.primary;
      ctx.beginPath();
      ctx.arc(headX + logoSize / 2, headY + logoSize / 2, logoSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.primary;
    ctx.font = '800 52px Saira, system-ui, sans-serif';
    ctx.fillText('JEEnie', headX + logoSize + 20, headY + 6);
    ctx.font = '500 22px Saira, system-ui, sans-serif';
    ctx.fillStyle = BRAND.primary70;
    ctx.fillText('AI for JEE • NEET • Foundation', headX + logoSize + 20, headY + 60);

    const cx = W / 2;
    const isStory = variant === 'story';

    // --- Eyebrow ---
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.primary70;
    ctx.font = '600 28px Saira, system-ui, sans-serif';
    ctx.fillText('INSTALL THE APP', 60, isStory ? 260 : 220);

    // --- Big headline ---
    ctx.fillStyle = BRAND.primary;
    if (isStory) {
      ctx.font = '900 140px Saira, system-ui, sans-serif';
      let y = 320;
      ctx.fillText('Scan.', 60, y); y += 150;
      ctx.fillText('Install.', 60, y); y += 150;
      ctx.fillText('Crack it.', 60, y);
    } else {
      ctx.font = '900 96px Saira, system-ui, sans-serif';
      ctx.fillText('Scan to install', 60, 280);
      ctx.font = '500 34px Saira, system-ui, sans-serif';
      ctx.fillStyle = BRAND.primary70;
      ctx.fillText("India's smartest JEE / NEET / Foundation prep", 60, 400);
    }

    // --- QR white rounded card (bottom-right, mirrors paintFooter) ---
    const qrSize = isStory ? 520 : 360;
    const qrPad = isStory ? 40 : 28;
    const cardSize = qrSize + qrPad * 2;
    const cardX = W - cardSize - 60;
    const cardY = H - cardSize - (isStory ? 180 : 140);
    const r = 32;

    ctx.save();
    ctx.shadowColor = 'rgba(1,48,98,0.25)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cardX + r, cardY);
    ctx.arcTo(cardX + cardSize, cardY, cardX + cardSize, cardY + cardSize, r);
    ctx.arcTo(cardX + cardSize, cardY + cardSize, cardX, cardY + cardSize, r);
    ctx.arcTo(cardX, cardY + cardSize, cardX, cardY, r);
    ctx.arcTo(cardX, cardY, cardX + cardSize, cardY, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Draw QR
    const qrSvgStr = generateQRCodeSVG(INSTALL_URL, qrSize);
    const qrImg = await new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      const blob = new Blob([qrSvgStr], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      im.onload = () => { URL.revokeObjectURL(url); res(im); };
      im.onerror = rej;
      im.src = url;
    });
    ctx.drawImage(qrImg, cardX + qrPad, cardY + qrPad, qrSize, qrSize);

    // --- CTA text (bottom-left, mirrors paintFooter) ---
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    ctx.fillStyle = BRAND.primary;
    ctx.font = `800 ${isStory ? 44 : 34}px Saira, system-ui, sans-serif`;
    ctx.fillText('Scan • Tap link • Install', 60, H - (isStory ? 220 : 160));
    ctx.font = `500 ${isStory ? 26 : 22}px Saira, system-ui, sans-serif`;
    ctx.fillStyle = BRAND.primary70;
    ctx.fillText('Visit jeenie.website/install', 60, H - (isStory ? 175 : 125));

    // Bottom accent bar
    ctx.fillStyle = BRAND.primary;
    ctx.fillRect(0, H - 10, W, 10);

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
        description="Scan the QR to install JEEnie AI — India's smartest JEE, NEET & Foundation prep app. Free to start."
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

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 pt-5 pb-40 space-y-5">
          <p className="text-center text-[13px] text-muted-foreground leading-relaxed">
            Download the poster, share it on Instagram Story or WhatsApp Status.
            Friends scan → install directly. No Play Store needed.
          </p>

          {/* Poster preview — mirrors canvas exactly */}
          <div
            ref={posterRef}
            className="relative rounded-[28px] overflow-hidden mx-auto"
            style={{
              background: `linear-gradient(135deg, ${BRAND.bgFrom} 0%, ${BRAND.bgTo} 100%)`,
              aspectRatio: '9 / 16',
              maxWidth: '320px',
              width: '100%',
              boxShadow: '0 20px 50px -20px rgba(1,48,98,0.35)',
              fontFamily: 'Saira, system-ui, sans-serif',
            }}
          >
            {/* Decorative glows */}
            <div aria-hidden className="absolute -top-16 -right-16 w-56 h-56 rounded-full opacity-30 blur-3xl" style={{ background: BRAND.primary }} />
            <div aria-hidden className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full opacity-40 blur-3xl" style={{ background: BRAND.accent }} />

            <div className="relative h-full flex flex-col justify-between px-5 py-6" style={{ color: BRAND.primary }}>
              {/* Header: real logo + wordmark */}
              <div className="flex items-center gap-2.5">
                {logoReady && (
                  <img src={LOGO_URL} alt="JEEnie" className="w-11 h-11 object-contain" />
                )}
                <div className="flex flex-col leading-tight">
                  <span className="text-lg font-extrabold tracking-tight">JEEnie</span>
                  <span className="text-[9px] font-medium opacity-70">AI for JEE • NEET • Foundation</span>
                </div>
              </div>

              {/* Big headline */}
              <div className="leading-none space-y-1 -mt-6">
                <div className="text-[11px] font-semibold opacity-70 tracking-wider mb-2">INSTALL THE APP</div>
                <div className="text-[38px] font-black">Scan.</div>
                <div className="text-[38px] font-black">Install.</div>
                <div className="text-[38px] font-black">Crack it.</div>
              </div>

              {/* QR white card */}
              <div className="self-end bg-white rounded-2xl p-3" style={{ boxShadow: '0 12px 24px -8px rgba(1,48,98,0.35)' }}>
                <div
                  className="w-[150px] h-[150px] [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: qrSvgSmall }}
                />
              </div>

              {/* Footer CTA */}
              <div className="space-y-1">
                <div className="text-[13px] font-extrabold">Scan • Tap link • Install</div>
                <div className="text-[11px] font-medium opacity-70">Visit jeenie.website/install</div>
              </div>

              <div className="absolute inset-x-0 bottom-0 h-1" style={{ background: BRAND.primary }} />
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
                <div className="aspect-[9/16] rounded-lg mb-2 flex items-center justify-center text-[10px] font-bold p-2" style={{ background: `linear-gradient(135deg, ${BRAND.bgFrom}, ${BRAND.bgTo})`, color: BRAND.primary }}>
                  <div className="text-center leading-tight">
                    <div>Scan.</div><div>Install.</div><div>Crack it.</div>
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
                <div className="aspect-square rounded-lg mb-2 flex items-center justify-center text-[10px] font-bold p-2" style={{ background: `linear-gradient(135deg, ${BRAND.bgFrom}, ${BRAND.bgTo})`, color: BRAND.primary }}>
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
            Pro tip: post on Instagram Story with a "Link" sticker to{' '}
            <span className="text-foreground font-medium">jeenie.website/install</span> for one-tap install.
          </p>
        </div>
      </main>

      {/* Sticky bottom action bar */}
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
