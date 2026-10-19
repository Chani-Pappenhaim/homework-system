import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupDetailPage from '@/pages/teacher/GroupDetailPage';
import { renderWithProviders } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/groups.api', () => ({ groupsApi: { get: vi.fn(), delete: vi.fn() } }));
vi.mock('@/api/courses.api', () => ({ coursesApi: { update: vi.fn() } }));

import { groupsApi } from '@/api/groups.api';
const getMock = groupsApi.get as unknown as ReturnType<typeof vi.fn>;
const deleteMock = groupsApi.delete as unknown as ReturnType<typeof vi.fn>;

const group = {
  id: 'g1', name: 'קבוצה א', seminar: 'סמינר X', year: '2026', createdAt: '', studentCount: 0,
  students: [],
  courses: [
    { id: 'c1', name: 'קורס 1', hidden: false, lessonCount: 0 },
    { id: 'c2', name: 'קורס 2', hidden: false, lessonCount: 0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  getMock.mockResolvedValue({ data: { data: { group } } });
  deleteMock.mockResolvedValue({ data: {} });
});

function renderPage() {
  return renderWithProviders(<GroupDetailPage />, { path: '/teacher/groups/:id', initialEntries: ['/teacher/groups/g1'] });
}

describe('GroupDetailPage', () => {
  it('warns how many courses go with the group, deletes it once she confirms, and returns to the groups', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /מחק קבוצה/ }));
    expect(await screen.findByText(/כל 2 הקורסים של הקבוצה/)).toBeInTheDocument();
    expect(deleteMock).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('g1'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher/groups'));
  });

  it('opens the edit form', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /ערוך קבוצה/ }));
    expect(navigate).toHaveBeenCalledWith('/teacher/groups/g1/edit');
  });
});
