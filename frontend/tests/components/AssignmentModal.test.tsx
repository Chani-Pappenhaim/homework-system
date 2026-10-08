import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/assignments.api', () => ({
  assignmentsApi: { create: vi.fn(), update: vi.fn() },
}));

import { assignmentsApi } from '@/api/assignments.api';
import { AssignmentModal, defaultDeadline } from '@/components/lesson/AssignmentModal';
import { ToastProvider } from '@/components/ui/toast';

const create = assignmentsApi.create as unknown as ReturnType<typeof vi.fn>;
const update = assignmentsApi.update as unknown as ReturnType<typeof vi.fn>;

function renderModal(value: Parameters<typeof AssignmentModal>[0]['value'], lessonDate = '2026-09-01T00:00:00.000Z') {
  return renderWithProviders(
    <ToastProvider>
      <AssignmentModal lessonId="l1" lessonDate={lessonDate} value={value} onClose={() => {}} />
    </ToastProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({});
  update.mockResolvedValue({});
});

describe('defaultDeadline', () => {
  it('lands a week after the lesson, at the end of the day', () => {
    expect(defaultDeadline('2026-09-01T00:00:00.000Z')).toBe('2026-09-08T23:59');
  });
});

describe('AssignmentModal', () => {
  it('pre-fills a new assignment with a deadline a week after the lesson', () => {
    renderModal('new');
    expect(screen.getByLabelText('מועד אחרון')).toHaveValue('2026-09-08T23:59');
  });

  it('will not save without a description', async () => {
    renderModal('new');
    await userEvent.type(screen.getByLabelText('כותרת המטלה'), 'פרויקט');
    const save = screen.getByRole('button', { name: 'צרי מטלה' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByLabelText('תיאור המטלה *'), 'הוראות בדיקה');
    expect(save).toBeEnabled();
  });

  it('can remove the deadline, and sends null so it is really cleared', async () => {
    renderModal({ id: 'a1', title: 'T', description: 'D', deadline: '2026-09-08T20:59:00.000Z' } as never);
    await userEvent.click(screen.getByRole('button', { name: 'ללא מועד אחרון' }));
    expect(screen.getByText('אין מועד אחרון למטלה זו')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'שמרי שינויים' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('a1', expect.objectContaining({ deadline: null })));
  });
});
