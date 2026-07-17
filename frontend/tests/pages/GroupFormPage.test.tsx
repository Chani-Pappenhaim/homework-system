import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupFormPage from '@/pages/teacher/GroupFormPage';
import { renderWithProviders } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/groups.api', () => ({
  groupsApi: { get: vi.fn(), create: vi.fn(), update: vi.fn(), addStudent: vi.fn(), removeStudent: vi.fn(), resetPassword: vi.fn(), importStudents: vi.fn() },
}));

import { groupsApi } from '@/api/groups.api';
const getGroup = groupsApi.get as unknown as ReturnType<typeof vi.fn>;
const createGroup = groupsApi.create as unknown as ReturnType<typeof vi.fn>;
const addStudent = groupsApi.addStudent as unknown as ReturnType<typeof vi.fn>;

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

  it('disables submit until name and year are filled', async () => {
    renderNew();
    const submit = screen.getByRole('button', { name: 'צור קבוצה' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('קבוצה א'), 'קבוצה ב');
    await userEvent.type(screen.getByPlaceholderText('תשפ"ו'), '2026');
    expect(submit).toBeEnabled();
  });

  it('creates the group and navigates to its edit page', async () => {
    createGroup.mockResolvedValue({ data: { data: { group: { id: 'g42' } } } });
    renderNew();
    await userEvent.type(screen.getByPlaceholderText('קבוצה א'), 'קבוצה ב');
    await userEvent.type(screen.getByPlaceholderText('תשפ"ו'), '2026');
    await userEvent.click(screen.getByRole('button', { name: 'צור קבוצה' }));
    await waitFor(() => expect(createGroup).toHaveBeenCalledWith({ name: 'קבוצה ב', seminar: undefined, year: '2026' }));
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
    students: [{ id: 's1', name: 'דנה', email: 'dana@x.com', createdAt: '' }],
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
});
