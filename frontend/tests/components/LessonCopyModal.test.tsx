import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../utils/render';
import { ToastProvider } from '@/components/ui/toast';
import { LessonCopyModal, clearedDeadlinesNote } from '@/components/lesson/LessonCopyModal';

vi.mock('@/api/lessons.api', () => ({ lessonsApi: { copy: vi.fn() } }));
vi.mock('@/api/courses.api', () => ({ coursesApi: { list: vi.fn() } }));

import { lessonsApi } from '@/api/lessons.api';
import { coursesApi } from '@/api/courses.api';
const copy = lessonsApi.copy as unknown as ReturnType<typeof vi.fn>;
const list = coursesApi.list as unknown as ReturnType<typeof vi.fn>;

const lesson = { id: 'l1', courseId: 'c1', topic: 'Hooks' } as any;

beforeEach(() => {
  vi.clearAllMocks();
  list.mockResolvedValue({ data: { data: { courses: [{ id: 'c1', name: 'React' }] } } });
});

function renderModal() {
  return renderWithProviders(
    <ToastProvider><LessonCopyModal lesson={lesson} open onClose={() => {}} /></ToastProvider>,
  );
}

describe('clearedDeadlinesNote', () => {
  it('says nothing when no deadline was dropped', () => {
    expect(clearedDeadlinesNote(0)).toBe('');
    expect(clearedDeadlinesNote(undefined)).toBe('');
  });

  it('names one assignment or counts several', () => {
    expect(clearedDeadlinesNote(1)).toContain('למטלה אחת');
    expect(clearedDeadlinesNote(3)).toContain('ל-3 מטלות');
  });
});

describe('LessonCopyModal', () => {
  it('tells the teacher when copied assignments lost a deadline that already passed', async () => {
    copy.mockResolvedValue({ data: { data: { lesson: { id: 'l2', courseId: 'c1' }, clearedDeadlines: 2 } } });
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'שכפול' }));
    expect(await screen.findByText(/ל-2 מטלות המועד האחרון כבר עבר והוסר/)).toBeInTheDocument();
  });

  it('keeps the plain message when every deadline is still ahead', async () => {
    copy.mockResolvedValue({ data: { data: { lesson: { id: 'l2', courseId: 'c1' }, clearedDeadlines: 0 } } });
    renderModal();
    await userEvent.click(await screen.findByRole('button', { name: 'שכפול' }));
    expect(await screen.findByText('השיעור הועתק - העותק מוסתר מהתלמידות עד שתציגי אותו')).toBeInTheDocument();
  });
});
