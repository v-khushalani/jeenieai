// Single source of truth for JEEnie brand voice + visuals.
import mascotIdle from '@/assets/jeenie-mascot.png';
import mascotCheer from '@/assets/jeenie-mascot-cheer.png';
import mascotThink from '@/assets/jeenie-mascot-think.png';

export const BRAND = {
  name: 'JEEnie',
  legalName: 'JEEnie AI',
  tagline: 'Padhai ka apna bada dimaag',
  shortTagline: 'Tera AI study partner',
  site: 'jeenie.website',
  siteUrl: 'https://www.jeenie.website',
  poweredBy: 'Powered by JEEnie',
  labName: 'JEEnie Lab',
} as const;

export type MascotMood = 'idle' | 'cheer' | 'think';

export const MASCOT: Record<MascotMood, string> = {
  idle: mascotIdle,
  cheer: mascotCheer,
  think: mascotThink,
};

/** Rotating Hinglish lines shown while the app loads. */
export const LOADING_LINES = [
  'Chill kar, JEEnie soch raha hai…',
  'Chai peete peete load ho raha hai…',
  'Tere liye best plan bana raha hoon…',
  'Formula dhoondh raha hoon, ruk zara…',
  'Dimaag garam kar raha hoon…',
  'Aa raha hoon, ek second…',
] as const;

/** Default witty empty-state copy, keyed by context. */
export const EMPTY_LINES = {
  missions: {
    title: 'Aaj ka mission khaali hai',
    body: 'Ek chapter chun le, baaki JEEnie sambhal lega.',
    mood: 'think' as MascotMood,
  },
  doubts: {
    title: 'Koi doubt nahi? Sach me?',
    body: 'Pooch le kuch bhi — physics se lekar life tak.',
    mood: 'idle' as MascotMood,
  },
  community: {
    title: 'Yahan abhi sannata hai',
    body: 'Pehla message tu daal — legend ban ja.',
    mood: 'cheer' as MascotMood,
  },
  generic: {
    title: 'Yahan abhi kuch nahi hai',
    body: 'Thoda scroll kar ya shuru kar — JEEnie ready hai.',
    mood: 'idle' as MascotMood,
  },
  notFound: {
    title: '404 — Yeh page gayab hai',
    body: 'JEEnie ne bhi dhoonda, mila nahi. Chal wapas chalte hain.',
    mood: 'think' as MascotMood,
  },
} as const;

export const randomLoadingLine = () =>
  LOADING_LINES[Math.floor(Math.random() * LOADING_LINES.length)];
