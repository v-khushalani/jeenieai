// src/lib/shareCard.ts
// Generates branded shareable square (1080x1080) PNGs on canvas with QR.
import QRCode from 'qrcode';

const W = 1080;
const H = 1080;

const BRAND = {
  primary: '#013062',
  accent: '#e6eeff',
  glow: '#e9e9e9',
  bgFrom: '#e6eeff',
  bgTo: '#ffffff',
};

interface BaseOpts {
  referralUrl: string;
  handle?: string;
}

export interface TestScoreOpts extends BaseOpts {
  type: 'test';
  title: string;       // e.g. "JEE Physics Mock"
  scorePercent: number;
  correct: number;
  total: number;
  accuracy: number;
  timeMin: number;
}

export interface StreakOpts extends BaseOpts {
  type: 'streak';
  streakDays: number;
  questionsToday: number;
  level: string;
}

export interface WrappedSlideOpts extends BaseOpts {
  type: 'wrapped';
  heading: string;
  bigStat: string;
  subStat: string;
  emoji: string;
}

export interface RoastOpts extends BaseOpts {
  type: 'roast';
  topic: string;
  accuracy: number;
  roast: string;
}

export type ShareCardOpts = TestScoreOpts | StreakOpts | WrappedSlideOpts | RoastOpts;

async function loadQR(url: string): Promise<HTMLImageElement> {
  const dataUrl = await QRCode.toDataURL(url, {
    margin: 1,
    width: 220,
    color: { dark: BRAND.primary, light: '#FFFFFF' },
    errorCorrectionLevel: 'M',
  });
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function paintBackground(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, BRAND.bgFrom);
  grad.addColorStop(1, BRAND.bgTo);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const topBand = ctx.createLinearGradient(0, 0, W, 0);
  topBand.addColorStop(0, 'rgba(1,48,98,0.14)');
  topBand.addColorStop(1, 'rgba(1,48,98,0)');
  ctx.fillStyle = topBand;
  ctx.fillRect(0, 0, W, 180);

  // Decorative neutral glow circles
  const glow = ctx.createRadialGradient(W * 0.84, H * 0.16, 10, W * 0.84, H * 0.16, 420);
  glow.addColorStop(0, 'rgba(1,48,98,0.18)');
  glow.addColorStop(1, 'rgba(1,48,98,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const glow2 = ctx.createRadialGradient(W * 0.12, H * 0.92, 5, W * 0.12, H * 0.92, 460);
  glow2.addColorStop(0, 'rgba(230,238,255,0.95)');
  glow2.addColorStop(1, 'rgba(230,238,255,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, W, H);
}

function paintHeader(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = BRAND.primary;
  ctx.font = '800 44px Saira, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText('JEEnie', 60, 60);
  ctx.font = '500 22px Saira, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.fillText('AI for JEE • NEET • Foundation', 60, 118);
}

function paintFooter(ctx: CanvasRenderingContext2D, qr: HTMLImageElement, referralUrl: string) {
  // QR bottom-right
  const qrSize = 220;
  const pad = 60;
  // white card behind QR
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  const x = W - qrSize - pad, y = H - qrSize - pad, r = 24;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + qrSize, y, x + qrSize, y + qrSize, r);
  ctx.arcTo(x + qrSize, y + qrSize, x, y + qrSize, r);
  ctx.arcTo(x, y + qrSize, x, y, r);
  ctx.arcTo(x, y, x + qrSize, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.drawImage(qr, x, y, qrSize, qrSize);

  // CTA text bottom-left
  ctx.fillStyle = BRAND.primary;
  ctx.font = '800 36px Saira, system-ui, sans-serif';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Make it count on JEEnie', 60, H - 130);
  ctx.font = '500 22px Saira, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.fillText('Scan QR or visit jeenie.website', 60, H - 90);
  ctx.font = '500 18px monospace';
  ctx.fillStyle = BRAND.primary;
  const code = referralUrl.split('ref=')[1] || '';
  if (code) ctx.fillText(`Code: ${code}`, 60, H - 60);
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, y);
      line = words[n] + ' ';
      y += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line.trim(), x, y);
  return y;
}

function paintTest(ctx: CanvasRenderingContext2D, o: TestScoreOpts) {
  ctx.textBaseline = 'top';
  ctx.font = '600 28px Saira, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.fillText('TEST RESULT', 60, 220);

  ctx.fillStyle = BRAND.primary;
  ctx.font = '800 52px Saira, system-ui, sans-serif';
  wrapText(ctx, o.title, 60, 260, 760, 60);

  // BIG score
  ctx.font = '900 220px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  ctx.fillText(`${o.scorePercent}%`, 60, 410);

  ctx.font = '600 32px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  ctx.fillText(`${o.correct}/${o.total} correct  •  ${o.accuracy}% accuracy`, 60, 660);
  ctx.font = '400 26px Saira, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.fillText(`⏱  ${o.timeMin} min`, 60, 710);
}

function paintStreak(ctx: CanvasRenderingContext2D, o: StreakOpts) {
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.font = '600 28px Saira, system-ui, sans-serif';
  ctx.fillText('STREAK MILESTONE', 60, 220);

  ctx.font = '900 260px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  ctx.fillText(`${o.streakDays}🔥`, 60, 280);

  ctx.font = '700 48px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  ctx.fillText('day streak!', 60, 560);

  ctx.font = '400 28px Saira, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.fillText(`Today: ${o.questionsToday} questions  •  Level: ${o.level}`, 60, 640);
}

function paintWrapped(ctx: CanvasRenderingContext2D, o: WrappedSlideOpts) {
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.font = '600 28px Saira, system-ui, sans-serif';
  ctx.fillText('JEENIE YEARBOOK', 60, 220);

  ctx.font = '700 56px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  wrapText(ctx, `${o.emoji}  ${o.heading}`, 60, 280, 960, 64);

  ctx.font = '900 180px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  ctx.fillText(o.bigStat, 60, 460);

  ctx.font = '400 32px Saira, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  wrapText(ctx, o.subStat, 60, 680, 960, 40);
}

function paintRoast(ctx: CanvasRenderingContext2D, o: RoastOpts) {
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(1,48,98,0.72)';
  ctx.font = '600 28px Saira, system-ui, sans-serif';
  ctx.fillText('JEENIE ROAST 💀', 60, 220);

  ctx.font = '800 56px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  wrapText(ctx, o.topic, 60, 270, 760, 60);

  ctx.font = '900 130px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  ctx.fillText(`${o.accuracy}%`, 60, 380);

  ctx.font = '500 34px Saira, system-ui, sans-serif';
  ctx.fillStyle = BRAND.primary;
  wrapText(ctx, `"${o.roast}"`, 60, 560, 960, 44);
}

export async function generateShareCard(opts: ShareCardOpts): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  paintBackground(ctx);
  paintHeader(ctx);

  switch (opts.type) {
    case 'test':    paintTest(ctx, opts);    break;
    case 'streak':  paintStreak(ctx, opts);  break;
    case 'wrapped': paintWrapped(ctx, opts); break;
    case 'roast':   paintRoast(ctx, opts);   break;
  }

  const qr = await loadQR(opts.referralUrl);
  paintFooter(ctx, qr, opts.referralUrl);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png', 0.95);
  });
}

export async function downloadShareCard(opts: ShareCardOpts, filename = 'jeenie-share.png') {
  const blob = await generateShareCard(opts);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function shareNativeCard(opts: ShareCardOpts, text: string): Promise<boolean> {
  try {
    const blob = await generateShareCard(opts);
    const file = new File([blob], 'jeenie-share.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: 'JEEnie',
        text,
        url: opts.referralUrl,
      });
      return true;
    }
  } catch {
    // fall through
  }
  await downloadShareCard(opts);
  return false;
}
