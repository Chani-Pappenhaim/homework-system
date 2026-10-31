import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReactionBar } from '@/components/messages/ReactionBar';
import { REACTION_EMOJIS } from '@/lib/reactions';

const reactions = [
  { emoji: '👍', count: 2, mine: true, names: ['דנה', 'את'] },
  { emoji: '🙏', count: 1, mine: false, names: ['רבקה'] },
];

describe('ReactionBar', () => {
  it('shows a chip per emoji with its count, pressed when it is hers', () => {
    render(<ReactionBar reactions={reactions} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '👍 2, הוספת' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '🙏 1' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('names who reacted in the tooltip', () => {
    render(<ReactionBar reactions={reactions} onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: '👍 2, הוספת' })).toHaveAttribute('title', 'דנה, את');
  });

  it('toggles an emoji by clicking its chip', async () => {
    const onToggle = vi.fn();
    render(<ReactionBar reactions={reactions} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('button', { name: '🙏 1' }));
    expect(onToggle).toHaveBeenCalledWith('🙏');
  });

  it('builds the picker from the whitelist, and closes it after a pick', async () => {
    const onToggle = vi.fn();
    render(<ReactionBar reactions={[]} onToggle={onToggle} />);
    const opener = screen.getByRole('button', { name: 'הוספת תגובת אימוג׳י' });
    expect(opener).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(opener);
    expect(opener).toHaveAttribute('aria-expanded', 'true');
    const picker = screen.getByRole('group', { name: 'בחירת אימוג׳י' });
    expect(picker.querySelectorAll('button')).toHaveLength(REACTION_EMOJIS.length);
    await userEvent.click(screen.getByRole('button', { name: 'הגיבי ב-✅' }));
    expect(onToggle).toHaveBeenCalledWith('✅');
    expect(screen.queryByRole('group', { name: 'בחירת אימוג׳י' })).not.toBeInTheDocument();
  });
});
