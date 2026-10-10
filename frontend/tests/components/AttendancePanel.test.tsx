import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AttendancePanel } from '@/components/teacher/attendance/AttendancePanel';
import { ToastProvider } from '@/components/ui/toast';
import type { CourseAttendanceDTO } from '@/api/attendance.api';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/attendance.api', () => ({
  attendanceApi: {
    getCourse: vi.fn(),
    saveRecords: vi.fn(() => Promise.resolve({ data: {} })),
    saveHomeworkMarks: vi.fn(() => Promise.resolve({ data: {} })),
    addHomework: vi.fn(() => Promise.resolve({ data: {} })),
    createSessionsFromLessons: vi.fn(() => Promise.resolve({ data: { data: { created: 1, undated: 0 } } })),
    downloadTemplate: vi.fn(),
    importFile: vi.fn(),
    setExclusion: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import { attendanceApi } from '@/api/attendance.api';
const api = attendanceApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function course(overrides: Partial<CourseAttendanceDTO> = {}): CourseAttendanceDTO {
  return {
    course: { id: 'c1', name: 'React' },
    roster: [
      { id: 's1', name: 'אסתר', email: 'a@x.com', source: 'group', excluded: false },
      { id: 's2', name: 'בתיה', email: 'b@x.com', source: 'group', excluded: false },
      { id: 's3', name: 'גילה', email: 'g@x.com', source: 'access', excluded: true },
    ],
    lessons: [{
      id: 'l1', topic: 'Hooks', lessonDate: '2026-10-05T00:00:00.000Z', hidden: false,
      assignments: [{ id: 'as1', title: 'תרגיל useState', deadline: null, submittedBy: ['s2'] }],
    }],
    sessions: [
      { id: 'a1', date: '2026-10-05T00:00:00.000Z', title: null, lessonId: 'l1', records: [{ studentId: 's1', status: 'PRESENT', note: null }], homework: [] },
      { id: 'a0', date: '2026-09-28T00:00:00.000Z', title: 'חזרה פרונטלית', lessonId: null, records: [], homework: [{ id: 'h1', title: 'דף עבודה', doneBy: [] }] },
    ],
    ...overrides,
  };
}

function renderPanel(data = course()) {
  api.getCourse.mockResolvedValue({ data: { success: true, data } });
  return renderWithProviders(<ToastProvider><AttendancePanel courseId="c1" /></ToastProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('AttendancePanel', () => {
  it('opens on the newest meeting with the lesson topic and its site assignment', async () => {
    renderPanel();
    expect(await screen.findByRole('heading', { name: 'Hooks' })).toBeInTheDocument();
    expect(screen.getByText('תרגיל useState')).toBeInTheDocument();
    // The excluded access student is left off the sheet.
    expect(screen.queryByText('גילה')).not.toBeInTheDocument();
    expect(screen.getByText('לא סומנו: 1')).toBeInTheDocument();
  });

  it('saves a mark the moment a status is pressed', async () => {
    // Keep the save in flight so the sheet shows the optimistic mark, not a refetch.
    api.saveRecords.mockReturnValueOnce(new Promise(() => {}));
    renderPanel();
    const group = await screen.findByRole('radiogroup', { name: 'נוכחות — בתיה' });
    await userEvent.click(within(group).getByRole('radio', { name: /חסרה/ }));
    expect(api.saveRecords).toHaveBeenCalledWith('a1', [{ studentId: 's2', status: 'ABSENT' }]);
    // Optimistic: the sheet reflects it before the refetch.
    expect(within(group).getByRole('radio', { name: /חסרה/ })).toHaveAttribute('aria-checked', 'true');
  });

  it('pressing the current status again clears the mark', async () => {
    renderPanel();
    const group = await screen.findByRole('radiogroup', { name: 'נוכחות — אסתר' });
    await userEvent.click(within(group).getByRole('radio', { name: /נוכחת/ }));
    expect(api.saveRecords).toHaveBeenCalledWith('a1', [{ studentId: 's1', status: null }]);
  });

  it('marks everyone not yet marked as present in one go', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /כל השאר נוכחות/ }));
    expect(api.saveRecords).toHaveBeenCalledWith('a1', [{ studentId: 's2', status: 'PRESENT' }]);
  });

  it('ticks extra homework on a class-only meeting', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /חזרה פרונטלית/ }));
    expect(screen.getByText('מפגש שלא באתר')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: 'דף עבודה — בתיה' }));
    expect(api.saveHomeworkMarks).toHaveBeenCalledWith('h1', [{ studentId: 's2', done: true }]);
  });

  it('shows the whole term in the summary grid with a rate per student', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('tab', { name: /טבלת סיכום/ }));
    const row = screen.getByRole('rowheader', { name: 'אסתר' }).closest('tr')!;
    expect(within(row).getByText('100%')).toBeInTheDocument();
  });

  it('explains required and optional columns before an excel import', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /ייבוא מ-Excel/ }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText('חובה')).toHaveLength(3);
    expect(within(dialog).getAllByText('רשות')).toHaveLength(3);
    expect(within(dialog).getByRole('button', { name: /הורדת קובץ דוגמה/ })).toBeInTheDocument();
  });

  it('offers to open meetings from the lessons when there are none yet', async () => {
    renderPanel(course({ sessions: [] }));
    await userEvent.click(await screen.findByRole('button', { name: /מפגש לכל שיעור עם תאריך/ }));
    await waitFor(() => expect(api.createSessionsFromLessons).toHaveBeenCalledWith('c1'));
  });

  it('lets an access student be brought back into attendance', async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole('button', { name: /תלמידות \(2 · 1 מוחרגות\)/ }));
    await userEvent.click(screen.getByRole('checkbox'));
    expect(api.setExclusion).toHaveBeenCalledWith('c1', 's3', false);
  });
});
