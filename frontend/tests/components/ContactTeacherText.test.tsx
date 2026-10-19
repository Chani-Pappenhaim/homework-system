import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContactTeacherText, messageTeacherPath } from '@/components/student/ContactTeacherText';

function renderText(text: string, about?: string) {
  return render(<MemoryRouter><ContactTeacherText text={text} about={about} /></MemoryRouter>);
}

describe('ContactTeacherText', () => {
  it('links a message that sends her to the teacher to a new message, started with what it is about', () => {
    renderText('יצירת הבוחן נכשלה. פני למורה.', 'בנוגע לחידון: ');
    const link = screen.getByRole('link', { name: /שליחת הודעה למורה/ });
    const url = new URL(link.getAttribute('href')!, 'http://x');
    expect(url.pathname).toBe('/student/messages');
    expect(url.searchParams.get('compose')).toBe('1');
    expect(url.searchParams.get('draft')).toBe('בנוגע לחידון: ');
  });

  it('also catches the "לפנות למורה" wording', () => {
    renderText('ואם זה חוזר - כדאי לפנות למורה.');
    expect(screen.getByRole('link', { name: /שליחת הודעה למורה/ })).toHaveAttribute('href', messageTeacherPath());
  });

  it('adds no link to a message that does not mention the teacher', () => {
    renderText('בדיקת ה-AI לא הצליחה. אפשר לבקש בדיקה שוב.');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
