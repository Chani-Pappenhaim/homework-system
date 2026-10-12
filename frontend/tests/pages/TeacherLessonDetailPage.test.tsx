import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherLessonDetailPage from '@/pages/teacher/LessonDetailPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/lessons.api', () => ({
  lessonsApi: { get: vi.fn(), getAccess: vi.fn(), grantAccess: vi.fn(), revokeAccess: vi.fn(), setFileRequired: vi.fn() },
}));
vi.mock('@/api/assignments.api', () => ({
  assignmentsApi: { getSubmissions: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
vi.mock('@/api/submissions.api', () => ({
  submissionsApi: { approveAi: vi.fn(), restoreAiScore: vi.fn() },
}));
vi.mock('@/api/grades.api', () => ({ gradesApi: { grade: vi.fn() } }));
vi.mock('@/api/groups.api', () => ({ groupsApi: { list: vi.fn(), get: vi.fn() } }));

import { lessonsApi } from '@/api/lessons.api';
import { assignmentsApi } from '@/api/assignments.api';
import { submissionsApi } from '@/api/submissions.api';
import { gradesApi } from '@/api/grades.api';

const getLesson = lessonsApi.get as unknown as ReturnType<typeof vi.fn>;
const getAccess = lessonsApi.getAccess as unknown as ReturnType<typeof vi.fn>;
const setFileRequired = lessonsApi.setFileRequired as unknown as ReturnType<typeof vi.fn>;
const getSubmissions = assignmentsApi.getSubmissions as unknown as ReturnType<typeof vi.fn>;
const approveAi = submissionsApi.approveAi as unknown as ReturnType<typeof vi.fn>;
const grade = gradesApi.grade as unknown as ReturnType<typeof vi.fn>;

import { groupsApi } from '@/api/groups.api';
const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;

const lesson = {
  id: 'l1',
  topic: 'שיעור בדיקה',
  lessonDate: '2026-07-01T00:00:00Z',
  contentMd: '',
  githubUrls: [],
  hidden: false,
  order: 0,
  files: [],
  assignments: [
    {
      id: 'a1',
      title: 'מטלה ראשית',
      description: 'תיאור',
      deadline: '2026-08-01T00:00:00Z',
      allowedTypes: [],
      allowGithub: true,
      allowFile: false,
      requirements: [{ id: 'r1', text: 'דרישה 1' }],
    },
  ],
};

function renderPage() {
  return renderWithProviders(<TeacherLessonDetailPage />, {
    path: '/teacher/lesson/:id',
    initialEntries: ['/teacher/lesson/l1'],
  });
}

async function openAssignmentsTab() {
  await screen.findByRole('heading', { name: 'שיעור בדיקה' });
  await userEvent.click(screen.getByRole('button', { name: 'מטלות' }));
}

async function openAssignment(title = 'מטלה ראשית') {
  await openAssignmentsTab();
  await userEvent.click(await screen.findByRole('button', { name: new RegExp(title) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  getLesson.mockResolvedValue({ data: { data: { lesson } } });
  getAccess.mockResolvedValue({ data: { data: { students: [] } } });
  groupsList.mockResolvedValue({ data: { data: { groups: [] } } });
});

describe('TeacherLessonDetailPage', () => {
  it('renders the lesson and its submissions', async () => {
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's1', studentName: 'רותי', studentEmail: 'ruti@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: false, githubUrl: 'https://github.com/a/b', grade: null },
      ] } },
    });
    renderPage();
    await openAssignment();
    expect(await screen.findByRole('heading', { name: 'רותי' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'הגשות' })).toHaveTextContent('רותי');
  });

  it('keeps the open assignment in the address, so a refresh lands on it', async () => {
    getSubmissions.mockResolvedValue({ data: { data: { submissions: [] } } });
    renderWithProviders(<TeacherLessonDetailPage />, {
      path: '/teacher/lesson/:id',
      initialEntries: [`/teacher/lesson/l1?tab=assignments&assignmentId=${lesson.assignments[0].id}`],
    });
    expect(await screen.findByRole('button', { name: /חזרה לרשימת המטלות/ })).toBeInTheDocument();
    expect(getSubmissions).toHaveBeenCalledWith(lesson.assignments[0].id);
  });

  it('opens the first ungraded submission with the suggested score prefilled', async () => {
    // not late, 1 unchecked requirement => 100 - 0 - 5 = 95
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's1', studentName: 'רותי', studentEmail: 'ruti@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: false, githubUrl: 'https://github.com/a/b', grade: null },
      ] } },
    });
    renderPage();
    await openAssignment();
    expect(await screen.findByRole('heading', { name: 'רותי' })).toBeInTheDocument();
    const scoreInput = screen.getByPlaceholderText('85') as HTMLInputElement;
    expect(scoreInput.value).toBe('95');
  });

  it('prefills the existing teacher scores when the submission is already graded', async () => {
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's2', studentName: 'נועה', studentEmail: 'noa@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: true, githubUrl: 'https://github.com/a/b', grade: { submissionScore: 77, contentScore: 82, feedback: '', gradedAt: '' } },
      ] } },
    });
    renderPage();
    await openAssignment();
    const submissionInput = await screen.findByPlaceholderText('85') as HTMLInputElement;
    const contentInput = screen.getByPlaceholderText('90') as HTMLInputElement;
    expect(submissionInput.value).toBe('77');
    expect(contentInput.value).toBe('82');
  });

  it('renders two score inputs and the grade mutation sends both scores', async () => {
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's4', studentName: 'רותי', studentEmail: 'ruti@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: false, githubUrl: 'https://github.com/a/b', grade: null },
      ] } },
    });
    grade.mockResolvedValue({ data: {} });
    renderPage();
    await openAssignment();

    // Both inputs render; submissionScore prefilled to the suggestion (95), content empty.
    const submissionInput = await screen.findByPlaceholderText('85') as HTMLInputElement;
    const contentInput = screen.getByPlaceholderText('90') as HTMLInputElement;
    expect(submissionInput.value).toBe('95');
    expect(contentInput.value).toBe('');
    await userEvent.type(contentInput, '90');
    await userEvent.click(screen.getByRole('button', { name: 'שמור ציון' }));

    await waitFor(() => expect(grade).toHaveBeenCalledWith('s4', expect.objectContaining({
      submissionScore: 95,
      contentScore: 90,
    })));
  });

  it('shows approve-AI and restore-AI controls when the submission has a completed AI review', async () => {
    getSubmissions.mockResolvedValue({
      data: { data: { submissions: [
        { id: 's3', studentName: 'תמר', studentEmail: 't@x.com', submittedAt: '2026-07-10T10:00:00Z', isLate: false, githubUrl: 'https://github.com/a/b', grade: null, aiStatus: 'done', aiScore: 88, aiApproved: false, aiVerbalReview: 'עבודה טובה' },
      ] } },
    });
    approveAi.mockResolvedValue({ data: {} });
    renderPage();
    await openAssignment();

    expect(await screen.findByText(/בדיקת AI — ציון: 88/)).toBeInTheDocument();
    const approveBtn = screen.getByRole('button', { name: /אשרי ציון AI לתלמידה/ });
    expect(approveBtn).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /החזירי לציון AI/ })).toBeInTheDocument();

    await userEvent.click(approveBtn);
    await waitFor(() => expect(approveAi).toHaveBeenCalled());
  });

  it('opens the new-assignment modal from the "new assignment" button', async () => {
    getSubmissions.mockResolvedValue({ data: { data: { submissions: [] } } });
    renderPage();
    await openAssignmentsTab();
    await userEvent.click(screen.getByRole('button', { name: /מטלה חדשה/ }));
    expect(await screen.findByText('כותרת המטלה')).toBeInTheDocument();
  });

  it('toggles a file as mandatory viewing via the star button', async () => {
    getLesson.mockResolvedValue({
      data: { data: { lesson: { ...lesson, files: [{ id: 'f1', name: 'סרטון', url: '/f1', required: false }] } } },
    });
    getSubmissions.mockResolvedValue({ data: { data: { submissions: [] } } });
    setFileRequired.mockResolvedValue({ data: {} });
    renderPage();

    await screen.findByRole('heading', { name: 'שיעור בדיקה' });
    await userEvent.click(screen.getByRole('button', { name: 'קבצים מצורפים' }));
    await userEvent.click(screen.getByRole('button', { name: 'סימון כקובץ חובה' }));
    await waitFor(() => expect(setFileRequired).toHaveBeenCalledWith('l1', 'f1', true));
  });
});

describe('TeacherLessonDetailPage — grading workstation', () => {
  const sub = (id: string, studentName: string, grade: object | null) => ({
    id, studentName, studentEmail: `${id}@x.com`, submittedAt: '2026-07-10T10:00:00Z', isLate: false,
    githubUrl: 'https://github.com/a/b', grade,
  });
  // Server order is newest-first; the station lists them by name: אביגיל, יעל, מרים.
  const submissions = [
    sub('s-m', 'מרים', null),
    sub('s-y', 'יעל', { submissionScore: 90, gradedAt: '' }),
    sub('s-a', 'אביגיל', { submissionScore: 80, gradedAt: '' }),
  ];

  function renderAt(query: string) {
    return renderWithProviders(<TeacherLessonDetailPage />, {
      path: '/teacher/lesson/:id',
      initialEntries: [`/teacher/lesson/l1?assignmentId=a1${query}`],
    });
  }

  beforeEach(() => {
    getSubmissions.mockResolvedValue({ data: { data: { submissions } } });
    grade.mockResolvedValue({ data: {} });
  });

  it('lists the students by name and starts on the first one waiting for a grade', async () => {
    renderAt('');
    expect(await screen.findByRole('heading', { name: 'מרים' })).toBeInTheDocument();
    const names = within(screen.getByRole('list', { name: 'הגשות' })).getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toContain('אביגיל');
    expect(names[2]).toContain('מרים');
    expect(screen.getByText('3 מתוך 3')).toBeInTheDocument();
    expect(screen.getByText('נבדקו 2 מתוך 3')).toBeInTheDocument();
    // The last one: nowhere further to go.
    expect(screen.getByRole('button', { name: 'הבאה' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /שמרי ועברי לבאה/ })).not.toBeInTheDocument();
  });

  it('switches student from the list and with next', async () => {
    renderAt('');
    await screen.findByRole('heading', { name: 'מרים' });
    await userEvent.click(within(screen.getByRole('list', { name: 'הגשות' })).getByRole('button', { name: /אביגיל/ }));
    expect(await screen.findByRole('heading', { name: 'אביגיל' })).toBeInTheDocument();
    expect(screen.getByText('1 מתוך 3')).toBeInTheDocument();
    expect((screen.getByPlaceholderText('85') as HTMLInputElement).value).toBe('80');

    await userEvent.click(screen.getByRole('button', { name: 'הבאה' }));
    expect(await screen.findByRole('heading', { name: 'יעל' })).toBeInTheDocument();
    expect((screen.getByPlaceholderText('85') as HTMLInputElement).value).toBe('90');
  });

  it('opens the student named in the link and saves her grade before moving to the next', async () => {
    renderAt('&submissionId=s-a');
    expect(await screen.findByRole('heading', { name: 'אביגיל' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /שמרי ועברי לבאה/ }));

    await waitFor(() => expect(grade).toHaveBeenCalledWith('s-a', expect.objectContaining({ submissionScore: 80 })));
    expect(await screen.findByRole('heading', { name: 'יעל' })).toBeInTheDocument();
    expect(screen.getByText('2 מתוך 3')).toBeInTheDocument();
  });

  it('asks before leaving a grade with unsaved changes', async () => {
    renderAt('');
    await screen.findByRole('heading', { name: 'מרים' });
    await userEvent.type(screen.getByPlaceholderText('90'), '70');
    expect(screen.getByText('יש שינויים שלא נשמרו')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'הגשות' });
    await userEvent.click(within(list).getByRole('button', { name: /יעל/ }));
    expect(await screen.findByText('לעבור בלי לשמור?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'הישארות' }));
    expect(screen.getByRole('heading', { name: 'מרים' })).toBeInTheDocument();
    expect((screen.getByPlaceholderText('90') as HTMLInputElement).value).toBe('70');

    await userEvent.click(within(list).getByRole('button', { name: /יעל/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'מעבר בלי לשמור' }));
    expect(await screen.findByRole('heading', { name: 'יעל' })).toBeInTheDocument();
    expect(grade).not.toHaveBeenCalled();
  });

  it('keeps the brief and the AI instructions in their own tabs', async () => {
    renderAt('');
    await screen.findByRole('heading', { name: 'מרים' });
    expect(screen.getByRole('tab', { name: /הגשות/ })).toHaveAttribute('aria-selected', 'true');

    await userEvent.click(screen.getByRole('tab', { name: /פרטי המטלה/ }));
    expect(await screen.findByText('דרישה 1')).toBeInTheDocument();
    expect(screen.getByText('קישור GitHub')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'הגשות' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: /הנחיות AI/ }));
    expect(await screen.findByText(/לא הוגדרו הנחיות מיוחדות/)).toBeInTheDocument();
  });

  it('folds and unfolds each part of the assignment details', async () => {
    renderAt('&section=details');
    const requirements = await screen.findByRole('button', { name: 'דרישות' });
    const details = screen.getByRole('tabpanel');
    expect(requirements).toHaveAttribute('aria-expanded', 'true');
    expect(within(details).getByText('דרישה 1')).toBeInTheDocument();

    await userEvent.click(requirements);
    expect(requirements).toHaveAttribute('aria-expanded', 'false');
    expect(within(details).queryByText('דרישה 1')).not.toBeInTheDocument();
    expect(requirements).toHaveTextContent('דרישה אחת');

    // Folding one part leaves the others as they were.
    await userEvent.click(screen.getByRole('button', { name: 'מועד אחרון' }));
    expect(screen.getByRole('button', { name: /מועד אחרון/ })).toHaveTextContent('2026');
    expect(screen.getByRole('button', { name: 'אופן ההגשה' })).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(requirements);
    expect(within(details).getByText('דרישה 1')).toBeInTheDocument();
  });

  it('moves to another lesson tab straight from an open assignment', async () => {
    renderAt('&tab=assignments&section=details');
    await screen.findByRole('tab', { name: /פרטי המטלה/ });

    await userEvent.click(screen.getByRole('button', { name: /קבצים מצורפים/ }));
    expect(await screen.findByText('אין קבצים מצורפים')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /חזרה לרשימת המטלות/ })).not.toBeInTheDocument();

    // Back on the assignments tab: the list, not the assignment left behind.
    await userEvent.click(screen.getByRole('button', { name: 'מטלות' }));
    expect(await screen.findByRole('button', { name: /מטלה ראשית/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /פרטי המטלה/ })).not.toBeInTheDocument();
  });
});
