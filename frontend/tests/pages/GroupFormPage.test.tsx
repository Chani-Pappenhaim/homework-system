import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupFormPage from '@/pages/teacher/GroupFormPage';
import { renderWithProviders } from '../utils/render';
import * as utils from '@/lib/utils';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/groups.api', () => ({
  groupsApi: { get: vi.fn(), create: vi.fn(), update: vi.fn(), addStudent: vi.fn(), removeStudent: vi.fn(), removeStudents: vi.fn(), exportStudents: vi.fn(), updateStudent: vi.fn(), resetPassword: vi.fn(), importStudents: vi.fn() },
}));

import { groupsApi } from '@/api/groups.api';
const getGroup = groupsApi.get as unknown as ReturnType<typeof vi.fn>;
const createGroup = groupsApi.create as unknown as ReturnType<typeof vi.fn>;
const addStudent = groupsApi.addStudent as unknown as ReturnType<typeof vi.fn>;
const updateStudent = groupsApi.updateStudent as unknown as ReturnType<typeof vi.fn>;
const removeStudents = groupsApi.removeStudents as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe('GroupFormPage (new)', () => {
  function renderNew() {
    return renderWithProviders(<GroupFormPage />, {
      path: '/teacher/groups/new',
      initialEntries: ['/teacher/groups/new'],
    });
  }

  it('renders the "new group" heading and form', () => {
    renderNew();
    expect(screen.getByRole('heading', { name: 'קבוצה חדשה' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'צור קבוצה' })).toBeInTheDocument();
  });

  it('disables submit until seminar, name and year are filled', async () => {
    renderNew();
    const submit = screen.getByRole('button', { name: 'צור קבוצה' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('יד'), 'קבוצה ב');
    await userEvent.type(screen.getByPlaceholderText('תשפ"ו'), '2026');
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('סמינר מאיר'), 'סמינר מאיר');
    expect(submit).toBeEnabled();
  });

  it('creates the group and navigates to its edit page', async () => {
    createGroup.mockResolvedValue({ data: { data: { group: { id: 'g42' } } } });
    renderNew();
    await userEvent.type(screen.getByPlaceholderText('סמינר מאיר'), 'סמינר מאיר');
    await userEvent.type(screen.getByPlaceholderText('יד'), 'קבוצה ב');
    await userEvent.type(screen.getByPlaceholderText('תשפ"ו'), '2026');
    await userEvent.click(screen.getByRole('button', { name: 'צור קבוצה' }));
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith({ name: 'קבוצה ב', seminar: 'סמינר מאיר', year: '2026', emailNotificationsDefault: true }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher/groups/g42/edit'));
  });

  it('does not show the students section in new mode', () => {
    renderNew();
    expect(screen.queryByText(/תלמידות \(/)).not.toBeInTheDocument();
  });
});

describe('GroupFormPage (edit)', () => {
  const group = {
    id: 'g1', name: 'קבוצה א', seminar: 'סמינר', year: '2026', studentCount: 1, createdAt: '',
    students: [{ id: 's1', name: 'דנה', email: 'dana@x.com', githubUsername: 'dana-gh', createdAt: '' }],
    courses: [],
  };

  function renderEdit() {
    return renderWithProviders(<GroupFormPage />, {
      path: '/teacher/groups/:id/edit',
      initialEntries: ['/teacher/groups/g1/edit'],
    });
  }

  it('loads the group and lists its students', async () => {
    getGroup.mockResolvedValue({ data: { data: { group } } });
    renderEdit();
    expect(await screen.findByRole('heading', { name: 'עריכת קבוצה' })).toBeInTheDocument();
    // The heading is static — wait for the query-driven content instead.
    expect(await screen.findByText('תלמידות (1)')).toBeInTheDocument();
    expect(screen.getByText('דנה')).toBeInTheDocument();
  });

  // Row 24 of the client's sheet: deleting the account itself lives on the
  // student's page, so the group page leads there.
  it("links each student to her page, where her account can be deleted", async () => {
    getGroup.mockResolvedValue({ data: { data: { group } } });
    renderEdit();
    expect(await screen.findByRole('link', { name: 'דנה' })).toHaveAttribute('href', '/teacher/students/s1');
  });

  it('opens the add-student modal and submits a new student', async () => {
    getGroup.mockResolvedValue({ data: { data: { group } } });
    addStudent.mockResolvedValue({ data: {} });
    renderEdit();
    await screen.findByText('דנה');
    await userEvent.click(screen.getByRole('button', { name: /הוספת תלמידה/ }));
    await userEvent.type(screen.getByPlaceholderText('ישראלה ישראלי'), 'מרים');
    await userEvent.type(screen.getByPlaceholderText('student@example.com'), 'miri@x.com');
    await userEvent.click(screen.getByRole('button', { name: 'הוסף תלמידה' }));
    await waitFor(() => expect(addStudent).toHaveBeenCalledWith('g1', { name: 'מרים', email: 'miri@x.com', githubUsername: undefined }));
  });

  it("clears a student's GitHub username when the field is emptied", async () => {
    getGroup.mockResolvedValue({ data: { data: { group } } });
    updateStudent.mockResolvedValue({ data: {} });
    renderEdit();
    await screen.findByText('דנה');
    await userEvent.click(screen.getByTitle('עריכת פרטים'));
    const github = screen.getByLabelText('שם משתמש GitHub (אופציונלי)');
    expect(github).toHaveValue('dana-gh');
    await userEvent.clear(github);
    expect(screen.getByText(/הגשות שכבר הוגשו לא ייפגעו/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'שמור שינויים' }));
    // An empty string (not undefined) tells the server to remove the username
    await waitFor(() => expect(updateStudent).toHaveBeenCalledWith('g1', 's1', { name: 'דנה', email: 'dana@x.com', githubUsername: '' }));
  });
  it('selects every student shown with one click and removes them together', async () => {
    const three = {
      ...group,
      students: [
        group.students[0],
        { id: 's2', name: 'רחל', email: 'rachel@x.com', githubUsername: null, createdAt: '' },
        { id: 's3', name: 'לאה', email: 'leah@x.com', githubUsername: null, createdAt: '' },
      ],
    };
    getGroup.mockResolvedValue({ data: { data: { group: three } } });
    removeStudents.mockResolvedValue({ data: { data: { removed: 3 } } });
    renderEdit();
    const all = await screen.findByRole('checkbox', { name: 'בחירת כולן' });

    await userEvent.click(all);
    expect(screen.getByRole('button', { name: /הסר נבחרות \(3\)/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /הסר נבחרות/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'הסר את כולן' }));
    await waitFor(() => expect(removeStudents).toHaveBeenCalledTimes(1));
    expect([...removeStudents.mock.calls[0][1]].sort()).toEqual(['s1', 's2', 's3']);
  });

  it('selects only the students the search found, and unselects them again', async () => {
    const two = {
      ...group,
      students: [group.students[0], { id: 's2', name: 'רחל', email: 'rachel@x.com', githubUsername: null, createdAt: '' }],
    };
    getGroup.mockResolvedValue({ data: { data: { group: two } } });
    renderEdit();
    await userEvent.type(await screen.findByPlaceholderText('חיפוש לפי שם או מייל...'), 'רחל');
    const all = screen.getByRole('checkbox', { name: 'בחירת כולן' });
    await userEvent.click(all);
    expect(screen.getByRole('button', { name: /הסר נבחרות \(1\)/ })).toBeInTheDocument();
    await userEvent.click(all);
    expect(screen.queryByRole('button', { name: /הסר נבחרות/ })).not.toBeInTheDocument();
  });

  it("downloads the group's students as an Excel file named after the group", async () => {
    const download = vi.spyOn(utils, 'downloadBlob').mockImplementation(() => {});
    (groupsApi.exportStudents as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ data: new Blob(['x']) });
    getGroup.mockResolvedValue({ data: { data: { group } } });
    renderEdit();
    await userEvent.click(await screen.findByRole('button', { name: /הורדה לאקסל/ }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(expect.any(Blob), 'תלמידות סמינר קבוצה א 2026.xlsx'));
    expect(groupsApi.exportStudents).toHaveBeenCalledWith('g1');
  });
});
