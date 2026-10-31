import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { REACTION_EMOJIS } from '@/lib/reactions';
import { cn } from '@/lib/utils';
import type { ReactionDTO } from '@/types';

interface ReactionBarProps {
  reactions: ReactionDTO[];
  onToggle: (emoji: string) => void;
  disabled?: boolean;
}

/** The reactions on one entry as chips, and a small button that opens the picker for adding one. */
export function ReactionBar({ reactions, onToggle, disabled }: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  function pick(emoji: string) {
    setPickerOpen(false);
    onToggle(emoji);
  }

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          disabled={disabled}
          aria-pressed={r.mine}
          aria-label={`${r.emoji} ${r.count}${r.mine ? ', הוספת' : ''}`}
          title={r.names.join(', ')}
          onClick={() => onToggle(r.emoji)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
            r.mine ? 'border-clay bg-clay/10 text-clay' : 'border-rule bg-sheet text-ink-soft hover:border-clay/50',
          )}
        >
          <span aria-hidden>{r.emoji}</span>
          <span>{r.count}</span>
        </button>
      ))}

      <div className="relative">
        <button
          type="button"
          disabled={disabled}
          aria-label="הוספת תגובת אימוג׳י"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((o) => !o)}
          className="grid size-6 place-items-center rounded-full text-ink-soft/70 transition-colors hover:bg-ground hover:text-ink"
        >
          <SmilePlus size={14} />
        </button>
        {pickerOpen && (
          <div
            role="group"
            aria-label="בחירת אימוג׳י"
            className="absolute start-0 top-full z-10 mt-1 flex gap-0.5 rounded-input border border-rule bg-sheet p-1 shadow-soft"
          >
            {REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                aria-label={`הגיבי ב-${emoji}`}
                onClick={() => pick(emoji)}
                className="grid size-8 place-items-center rounded-md text-base hover:bg-ground"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
