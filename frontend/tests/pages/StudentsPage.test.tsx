import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentsPage from '@/pages/teacher/StudentsPage';
import StudentDetailPage from '@/pages/teacher/StudentDetailPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/students.api', () => ({ studentsApi: { overview: vi.fn(), profile: vi.fn() } }));

import { studentsApi } from '@/api/students.api';

const overview = studentsApi.overview as unknown as ReturnType<typeof vi.fn>;
const profile = studentsApi.profile as unknown as ReturnType<typeof vi.fn>;

const student = (over: Record<string, unknown>) => ({
  id: 's1', name: 'רחל', email: 'rachel@x.com', githubUsername: null, groupNames: ['קבוצה א'],
  assignments: { total: 4, submitted: 3, late: 1, missing: 1 },
  averageContentScore: 88, attendance: { present: 9, absent: 1, excused: 0, rate: 90 }, unreadMessages: 0,
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('StudentsPage', () => {
  beforeEach(() => {
    overview.mockResolvedValue({
      data: {
        data: {
          students: [
            student({}),
            student({
              id: 's2', name: 'לאה', email: 'leah@x.com', groupNames: ['קבוצה ב'],
              assignments: { total: 4, submitted: 4, late: 0, missing: 0 }, unreadMessages: 0,
              attendance: { present: 5, absent: 5, excused: 0, rate: 50 },
            }),
          ],
        },
      },
    });
  });

  it('shows each student with a summary and links to her page', async () => {
    renderWithProviders(<StudentsPage />);
    expect(await screen.findByText('רחל')).toBeInTheDocument();
    expect(screen.getByText('3/4')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('1 חסרות')).toBeInTheDocument();
    expect(screen.getByText('רחל').closest('a')).toHaveAttribute('href', '/teacher/students/s1');
  });

  it('filters by search text, group and needing attention', async () => {
    renderWithProviders(<StudentsPage />);
    await screen.findByText('רחל');

    await userEvent.type(screen.getByLabelText('חיפוש תלמידה'), 'leah');
    expect(screen.queryByText('רחל')).not.toBeInTheDocument();
    expect(screen.getByText('לאה')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('חיפוש תלמידה'));

    await userEvent.selectOptions(screen.getByLabelText('סינון לפי קבוצה'), 'קבוצה א');
    expect(screen.queryByText('לאה')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('סינון לפי קבוצה'), '');

    await userEvent.click(screen.getByLabelText('דורשות תשומת לב'));
    expect(screen.getByText('רחל')).toBeInTheDocument();
    expect(screen.queryByText('לאה')).not.toBeInTheDocument();
  });
});

const fullProfile = {
  student: {
    id: 's1', name: 'רחל', email: 'rachel@x.com', githubUsername: 'rachel', createdAt: '2026-01-01T00:00:00Z',
    emailVerified: true, groupNames: ['קבוצה א'], extraCourses: [], extraLessons: [],
  },
  work: [
    {
      assignmentId: 'a1', title: 'תרגיל 1', lessonId: 'l1', lessonTopic: 'מבוא', courseName: 'JS', deadline: '2026-02-01T00:00:00Z', overdue: false,
      submission: {
        id: 'sub1', submittedAt: '2026-01-30T10:00:00Z', isLate: false, githubUrl: null, fileName: null, aiStatus: 'none',
        submissionScore: 100, contentScore: 77, contentApproved: false,
      },
    },
    { assignmentId: 'a2', title: 'תרגיל 2', lessonId: 'l2', lessonTopic: 'לולאות', courseName: 'JS', deadline: '2026-02-08T00:00:00Z', overdue: true, submission: null },
  ],
  attendance: [{
    courseId: 'c1', courseName: 'JS',
    summary: { present: 1, absent: 1, excused: 0, sessions: 2, rate: 50 },
    sessions: [
      { id: 'x2', date: '2026-02-08T00:00:00Z', title: 'מפגש 2', status: 'ABSENT', note: 'הודיעה מראש' },
      { id: 'x1', date: '2026-02-01T00:00:00Z', title: 'מפגש 1', status: 'PRESENT', note: null },
    ],
  }],
  quizzes: [{ quizId: 'q1', lessonTopic: 'מבוא', courseName: 'JS', officialScore: 64, bestScore: 92, attempts: 3, takenAt: '2026-02-02T00:00:00Z' }],
  messages: [{ id: 'm1', assignmentTitle: 'תרגיל 2', lastAt: '2026-02-09T00:00:00Z', lastFromTeacher: false, preview: 'אפשר הארכה?', unread: 1, entries: 1 }],
};

describe('StudentDetailPage', () => {
  it('shows her work, attendance, quizzes and messages in brief', async () => {
    profile.mockResolvedValue({ data: { data: fullProfile } });
    renderWithProviders(<StudentDetailPage />, { path: '/teacher/students/:id', initialEntries: ['/teacher/students/s1'] });

    expect(await screen.findByRole('heading', { name: 'רחל' })).toBeInTheDocument();
    expect(profile).toHaveBeenCalledWith('s1');
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('(טרם אושר)')).toBeInTheDocument();
    expect(screen.getByText('חסר')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /בדיקה/ })).toHaveAttribute('href', '/teacher/lessons/l1?assignmentId=a1&submissionId=sub1');
    expect(screen.getByText(/הודיעה מראש/)).toBeInTheDocument();
    expect(screen.getByText(/2 ניסיונות תרגול/)).toBeInTheDocument();
    expect(screen.getByText('אפשר הארכה?').closest('a')).toHaveAttribute('href', '/teacher/messages?highlight=m1');
    expect(screen.getByRole('link', { name: /בדוח הציונים/ })).toHaveAttribute('href', '/teacher/reports?studentId=s1');
  });

  it('filters the work list to missing assignments', async () => {
    profile.mockResolvedValue({ data: { data: fullProfile } });
    renderWithProviders(<StudentDetailPage />, { path: '/teacher/students/:id', initialEntries: ['/teacher/students/s1'] });
    await screen.findByText('תרגיל 1');
    await userEvent.click(screen.getByRole('button', { name: 'חסרות' }));
    expect(screen.queryByText('תרגיל 1')).not.toBeInTheDocument();
    expect(screen.getByText('תרגיל 2')).toBeInTheDocument();
  });
});
