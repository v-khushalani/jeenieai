/**
 * JeenieCoachLine — the mascot's reaction to the student's current state.
 * States: idle nudge, high-combo hype, streak risk, comeback support, done.
 */
import { motion } from 'framer-motion';
import jeenieMascot from '@/assets/jeenie-mascot.png';

export type CoachState = 'idle' | 'combo' | 'risk' | 'comeback' | 'done';

const LINES: Record<CoachState, string[]> = {
  idle: [
    'Bas ek step — aaj ka kaam shuru karte hain.',
    'Sochna mat, main bata deta hu kya karna hai 👇',
  ],
  combo: [
    'Combo chal raha hai — ab rukna mat 🔥',
    'Yehi rhythm hai. Ek aur sahi = aur points.',
  ],
  risk: [
    'Bas 1 aur… streak safe ho jayegi 👀',
    'Aaj skip kiya toh streak chali jayegi.',
  ],
  comeback: [
    'Welcome back. Chalo 3 Qs se restart karte hain.',
    'Koi tension nahi — chhota sa step, phir se shuru.',
  ],
  done: [
    'Aaj ka kaam khatam. Kal aur mazaa aayega 😎',
    'Chain poori! Streak surakshit hai 🔥',
  ],
};

export default function JeenieCoachLine({ state }: { state: CoachState }) {
  const pool = LINES[state];
  const line = pool[new Date().getDate() % pool.length];

  const tone =
    state === 'risk'
      ? 'border-orange-500/40 bg-orange-500/10'
      : state === 'combo'
        ? 'border-primary/40 bg-primary/10'
        : state === 'done'
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : 'border-border/60 bg-muted/40';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex items-center gap-2.5 rounded-2xl border-2 px-3 py-2 ${tone}`}
      data-testid="jeenie-coach-line"
    >
      <motion.img
        src={jeenieMascot}
        alt="JEEnie"
        loading="lazy"
        width={1024}
        height={1024}
        animate={state === 'combo' ? { y: [0, -3, 0] } : { y: 0 }}
        transition={{ repeat: state === 'combo' ? Infinity : 0, duration: 1.4 }}
        className="w-9 h-9 object-contain object-bottom shrink-0"
      />
      <p className="text-[12px] font-bold leading-snug">{line}</p>
    </motion.div>
  );
}
