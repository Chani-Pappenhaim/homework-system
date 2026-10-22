import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoursesPage from '@/pages/teacher/CoursesPage';
import { renderWithProviders, setAuthUser } from '../utils/render';

vi.mock('@/api/courses.api', () => ({ coursesApi: { list: vi.fn(), update: vi.fn(), get: vi.fn() } }));

import { coursesApi } from '@/api/courses.api';

const list = coursesApi.list as unknown as ReturnType<typeof vi.fn>;

const course = (id: string, name: string, hidden: boolean) =>
  ({ id, name, hidden, groupName: 'כיתה א', groupId: 'g1', lessonCount: 2, createdAt: '2026-07-01T00:00:00Z' });

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser({ name: 'שרה', role: 'ADMIN' });
  list.mockResolvedValue({ data: { data: { courses: [course('c1', 'פייתון', false), course('c2', 'ישן', true)] } } });
});

describe('CoursesPage visible-only filter', () => {
  it('shows every course, hidden ones included, until the filter is ticked', async () => {
    renderWithProviders(<CoursesPage />);
    expect(await screen.findByText('פייתון')).toBeInTheDocument();
    expect(screen.getByText('ישן')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('checkbox', { name: 'רק קורסים שאינם מוסתרים' }));
    expect(screen.getByText('פייתון')).toBeInTheDocument();
    expect(screen.queryByText('ישן')).not.toBeInTheDocument();
  });

  it('keeps the filter from the address, so coming back to the page shows the same list', async () => {
    renderWithProviders(<CoursesPage />, { initialEntries: ['/teacher/courses?visibleOnly=1'] });
    expect(await screen.findByText('פייתון')).toBeInTheDocument();
    expect(screen.queryByText('ישן')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'רק קורסים שאינם מוסתרים' })).toBeChecked();
  });

  it('says so when every course is hidden', async () => {
    list.mockResolvedValue({ data: { data: { courses: [course('c2', 'ישן', true)] } } });
    renderWithProviders(<CoursesPage />, { initialEntries: ['/teacher/courses?visibleOnly=1'] });
    expect(await screen.findByText('כל הקורסים מוסתרים')).toBeInTheDocument();
  });
});
