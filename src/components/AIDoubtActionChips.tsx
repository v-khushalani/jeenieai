import React from 'react';
import { Lock } from 'lucide-react';
import type { JeenieMode } from '@/services/api/types';

/**
 * Progressive-disclosure chip row that appears AFTER the first assistant
 * answer. Replaces the old mode dropdown.
 *
 * Tier gating is enforced by the UI (locked chips open the pricing modal) —
 * JEEnie itself never mentions tiers or upgrades in its replies.
 *
 *   Free   → component is hidden entirely (single-shot stays enforced).
 *   Pro    → Explain More, Numericals, Exam Answer unlocked.
 *   Pro+   → all chips unlocked.
 */

export interface ChipDef {
  id: string;
  label: string;
  emoji: string;
  mode: JeenieMode;
  prompt: string;
  minTier: 'pro' | 'pro_plus';
}

const CHIPS: ChipDef[] = [
  {
    id: 'explain_more',
    label: 'Explain More',
    emoji: '💡',
    mode: 'deep',
    prompt: 'Iss concept ko aur deeply samjha — intuition, real-life analogy aur "kyun" ke saath.',
    minTier: 'pro',
  },
  {
    id: 'numericals',
    label: 'Numericals',
    emoji: '🔢',
    mode: 'steps',
    prompt: 'Iss topic pe 1 numerical de aur step-by-step solve karke dikha.',
    minTier: 'pro',
  },
  {
    id: 'exam_answer',
    label: 'Exam Answer',
    emoji: '📝',
    mode: 'exam',
    prompt: 'Iska board/JEE exam-style answer likh — marking scheme ke according define → derive → substitute → box final answer.',
    minTier: 'pro',
  },
  {
    id: 'pyqs',
    label: 'PYQs',
    emoji: '🎯',
    mode: 'master',
    prompt: 'Iss concept se related 1-2 important PYQs (JEE/NEET) bata, year ke saath, aur common trap bhi mention kar.',
    minTier: 'pro_plus',
  },
  {
    id: 'smart_notes',
    label: 'Smart Notes',
    emoji: '🧠',
    mode: 'quick',
    prompt: 'Iss reply ka 5-line revision summary bana — sirf key formula, definition aur 1 trick.',
    minTier: 'pro_plus',
  },
];

interface Props {
  tier: 'free' | 'pro' | 'pro_plus';
  onChip: (chip: ChipDef) => void;
  onLocked: (chip: ChipDef) => void;
  disabled?: boolean;
}

export const AIDoubtActionChips: React.FC<Props> = ({ tier, onChip, onLocked, disabled }) => {
  // Show chips for every tier — free users see Pro & Pro+ locks, Pro users see
  // Pro+ locks. Clicking a locked chip opens the matching upsell modal.
  const isUnlocked = (chip: ChipDef) =>
    chip.minTier === 'pro' ? tier === 'pro' || tier === 'pro_plus' : tier === 'pro_plus';

  return (
    <div
      className="flex gap-1.5 overflow-x-auto snap-x snap-mandatory pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Follow-up actions"
    >
      {CHIPS.map((chip) => {
        const unlocked = isUnlocked(chip);
        return (
          <button
            key={chip.id}
            type="button"
            disabled={disabled}
            onClick={() => (unlocked ? onChip(chip) : onLocked(chip))}
            className={`shrink-0 snap-start min-h-[36px] px-3 py-1.5 rounded-full border text-[11px] sm:text-xs font-semibold transition-all whitespace-nowrap ${
              unlocked
                ? 'bg-white border-primary/30 text-primary hover:bg-primary/5 active:scale-[0.97]'
                : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted/60'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={`${chip.label}${unlocked ? '' : ' (locked)'}`}
          >
            <span className="mr-1">{chip.emoji}</span>
            {chip.label}
            {!unlocked && <Lock className="inline ml-1 -mt-0.5" size={10} />}
          </button>
        );
      })}
    </div>
  );
};

export default AIDoubtActionChips;
