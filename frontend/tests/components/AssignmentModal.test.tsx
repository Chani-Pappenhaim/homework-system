import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

function renderModal(value: Parameters<typeof AssignmentModal>[0]['value'], lessonDate = '2099-09-01T00:00:00.000Z') {
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
    expect(defaultDeadline('2026-09-01T00:00:00.000Z', new Date(2026, 7, 20))).toBe('2026-09-08T23:59');
  });

  it("counts from today for a past lesson whose week is already over", () => {
    expect(defaultDeadline('2026-09-01T00:00:00.000Z', new Date(2026, 9, 14, 10, 0))).toBe('2026-10-21T23:59');
  });
});

describe('AssignmentModal', () => {
  it('pre-fills a new assignment with a deadline a week after the lesson', () => {
    renderModal('new');
    expect(screen.getByLabelText('מועד אחרון')).toHaveValue('2099-09-08T23:59');
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

  it('will not create an assignment with a deadline that already passed', async () => {
    renderModal('new');
    await userEvent.type(screen.getByLabelText('כותרת המטלה'), 'פרויקט');
    await userEvent.type(screen.getByLabelText('תיאור המטלה *'), 'הוראות');
    fireEvent.change(screen.getByLabelText('מועד אחרון'), { target: { value: '2020-01-01T10:00' } });
    expect(screen.getByText('המועד האחרון כבר עבר - בחרי תאריך עתידי')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'צרי מטלה' })).toBeDisabled();
  });

  it('still saves an old assignment whose deadline passed, when the deadline is not changed', async () => {
    renderModal({ id: 'a1', title: 'T', description: 'D', deadline: '2020-01-01T08:00:00.000Z' } as never);
    expect(screen.queryByText('המועד האחרון כבר עבר - בחרי תאריך עתידי')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'שמרי שינויים' }));
    await waitFor(() => expect(update).toHaveBeenCalledWith('a1', expect.objectContaining({ deadline: '2020-01-01T08:00:00.000Z' })));
  });

  it('allows AI review on a new assignment by default', async () => {
    renderModal('new');
    expect(screen.getByRole('checkbox', { name: /לאפשר בדיקת AI/ })).toBeChecked();
    expect(screen.getByLabelText('הנחיות לבדיקת AI (אופציונלי)')).toBeInTheDocument();
  });

  it('can turn AI review off, which hides the AI instructions and saves the choice', async () => {
    renderModal({ id: 'a1', title: 'T', description: 'D', deadline: null, aiInstructions: 'בדקי async' } as never);
    await userEvent.click(screen.getByRole('checkbox', { name: /לאפשר בדיקת AI/ }));
    expect(screen.queryByLabelText('הנחיות לבדיקת AI (אופציונלי)')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'שמרי שינויים' }));
    // The instructions are kept, so turning AI back on later restores them.
    await waitFor(() => expect(update).toHaveBeenCalledWith('a1', expect.objectContaining({
      aiReviewEnabled: false, aiInstructions: 'בדקי async',
    })));
  });

  it('shows an assignment saved with AI review off as off', () => {
    renderModal({ id: 'a1', title: 'T', description: 'D', deadline: null, aiReviewEnabled: false } as never);
    expect(screen.getByRole('checkbox', { name: /לאפשר בדיקת AI/ })).not.toBeChecked();
  });
});
