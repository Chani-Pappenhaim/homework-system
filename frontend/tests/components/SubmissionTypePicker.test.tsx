import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubmissionTypePicker, type SubmissionTypes } from '@/components/lesson/SubmissionTypePicker';

const base: SubmissionTypes = { allowGithub: true, allowFile: true, allowedTypes: [] };

describe('SubmissionTypePicker', () => {
  it('has an image preset', async () => {
    const onChange = vi.fn();
    render(<SubmissionTypePicker value={base} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'תמונה' }));
    expect(onChange).toHaveBeenCalledWith({ ...base, allowedTypes: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'] });
  });

  it('understands typed extensions the way a teacher writes them', () => {
    const onChange = vi.fn();
    render(<SubmissionTypePicker value={base} onChange={onChange} />);
    const input = screen.getByPlaceholderText(/סיומות נוספות/);
    fireEvent.blur(input, { target: { value: '.PY; *.html, image/*' } });
    expect(onChange.mock.calls[0][0].allowedTypes).toEqual(['py', 'html', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic']);
  });
});
