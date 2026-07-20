import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AssignmentsPage from '@/pages/student/AssignmentsPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/submissions.api', () => ({ submissionsApi: { mine: vi.fn() } }));
import { submissionsApi } from '@/api/submissions.api';
const mine = submissionsApi.mine as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('AssignmentsPage', () => {
  it('renders both empty states when nothing is pending or submitted', async () => {
    mine.mockResolvedValue({ data: { data: { pending: [], submitted: [] } } });
    renderWithProviders(<AssignmentsPage />);
    expect(await screen.findByText('אין מטלות פתוחות 🎉')).toBeInTheDocument();
    expect(screen.getByText('לא הוגשו מטלות עדיין')).toBeInTheDocument();
  });

  it('lists pending assignments with counts', async () => {
    mine.mockResolvedValue({ data: { data: {
      pending: [
        { assignmentId: 'a1', assignmentTitle: 'מטלה 1', courseName: 'קורס', lessonTopic: 'שיעור', deadline: '2999-01-01T00:00:00Z' },
      ],
      submitted: [],
    } } });
    renderWithProviders(<AssignmentsPage />);
    expect(await screen.findByText('מטלה 1')).toBeInTheDocument();
    expect(screen.getByText('לא הוגשו (1)')).toBeInTheDocument();
  });

  it('expands a graded submission to reveal both scores, feedback and checklist', async () => {
    mine.mockResolvedValue({ data: { data: {
      pending: [],
      submitted: [
        {
          submissionId: 's1', assignmentTitle: 'מטלה שהוגשה', courseName: 'קורס',
          submittedAt: '2026-07-01T10:00:00Z', isLate: false,
          grade: { submissionScore: 90, contentScore: 84, feedback: 'עבודה מצוינת', checklist: [{ id: 'r1', text: 'דרישה 1', checked: true }] },
        },
      ],
    } } });
    renderWithProviders(<AssignmentsPage />);
    const row = await screen.findByText('מטלה שהוגשה');
    // Feedback hidden until expanded
    expect(screen.queryByText('עבודה מצוינת')).not.toBeInTheDocument();
    await userEvent.click(row);
    expect(await screen.findByText('עבודה מצוינת')).toBeInTheDocument();
    expect(screen.getByText('דרישה 1')).toBeInTheDocument();
    expect(screen.getByText(/ציון הגשה:/)).toBeInTheDocument();
    expect(screen.getByText(/ציון תוכן:/)).toBeInTheDocument();
    expect(screen.getByText('84')).toBeInTheDocument();
  });

  it('shows the submission score but no content score when content is not yet approved (null)', async () => {
    mine.mockResolvedValue({ data: { data: {
      pending: [],
      submitted: [
        {
          submissionId: 's3', assignmentTitle: 'רק ציון הגשה', courseName: 'קורס',
          submittedAt: '2026-07-01T10:00:00Z', isLate: false,
          grade: { submissionScore: 88, contentScore: null, feedback: 'משוב', checklist: [] },
        },
      ],
    } } });
    renderWithProviders(<AssignmentsPage />);
    const row = await screen.findByText('רק ציון הגשה');
    await userEvent.click(row);
    expect(await screen.findByText(/ציון הגשה:/)).toBeInTheDocument();
    expect(screen.queryByText(/ציון תוכן:/)).not.toBeInTheDocument();
  });

  it('shows a "waiting for grade" badge for an ungraded submission', async () => {
    mine.mockResolvedValue({ data: { data: {
      pending: [],
      submitted: [
        { submissionId: 's2', assignmentTitle: 'ממתינה לציון', courseName: 'קורס', submittedAt: '2026-07-01T10:00:00Z', isLate: false, grade: null },
      ],
    } } });
    renderWithProviders(<AssignmentsPage />);
    expect(await screen.findByText('ממתין לציון')).toBeInTheDocument();
  });
});
