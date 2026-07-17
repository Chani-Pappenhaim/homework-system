import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CourseFormPage from '@/pages/teacher/CourseFormPage';
import { renderWithProviders } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/courses.api', () => ({
  coursesApi: { get: vi.fn(), create: vi.fn(), update: vi.fn(), addLink: vi.fn(), deleteLink: vi.fn(), uploadFile: vi.fn(), deleteFile: vi.fn(), copy: vi.fn() },
}));
vi.mock('@/api/groups.api', () => ({ groupsApi: { list: vi.fn() } }));
vi.mock('@/api/lessons.api', () => ({ lessonsApi: { update: vi.fn() } }));

import { coursesApi } from '@/api/courses.api';
import { groupsApi } from '@/api/groups.api';
const getCourse = coursesApi.get as unknown as ReturnType<typeof vi.fn>;
const createCourse = coursesApi.create as unknown as ReturnType<typeof vi.fn>;
const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  groupsList.mockResolvedValue({ data: { data: { groups: [{ id: 'g1', name: 'קבוצה א', year: '2026', studentCount: 0, createdAt: '' }] } } });
});

describe('CourseFormPage (new)', () => {
  function renderNew() {
    return renderWithProviders(<CourseFormPage />, {
      path: '/teacher/courses/new',
      initialEntries: ['/teacher/courses/new'],
    });
  }

  it('renders the "new course" heading and an empty form', async () => {
    renderNew();
    expect(screen.getByRole('heading', { name: 'קורס חדש' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'צור קורס' })).toBeInTheDocument();
  });

  it('disables submit until name and group are set', async () => {
    renderNew();
    const submit = screen.getByRole('button', { name: 'צור קורס' });
    expect(submit).toBeDisabled();
    await userEvent.type(screen.getByPlaceholderText('React מתקדם'), 'קורס חדש');
    await screen.findByRole('option', { name: /קבוצה א/ });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'g1');
    expect(submit).toBeEnabled();
  });

  it('creates a course and navigates to its detail page', async () => {
    createCourse.mockResolvedValue({ data: { data: { course: { id: 'c123' } } } });
    renderNew();
    await userEvent.type(screen.getByPlaceholderText('React מתקדם'), 'קורס חדש');
    await screen.findByRole('option', { name: /קבוצה א/ });
    await userEvent.selectOptions(screen.getByRole('combobox'), 'g1');
    await userEvent.click(screen.getByRole('button', { name: 'צור קורס' }));
    await waitFor(() => expect(createCourse).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'קורס חדש', groupId: 'g1' })
    ));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher/courses/c123'));
  });
});

describe('CourseFormPage (edit)', () => {
  const course = {
    id: 'c1', name: 'קורס קיים', year: '2026', description: 'desc', groupId: 'g1',
    hidden: false, lessonCount: 1, createdAt: '', groupName: 'קבוצה א',
    lessons: [{ id: 'l1', topic: 'שיעור', hidden: false, order: 0 }],
    links: [], files: [],
  };

  function renderEdit() {
    return renderWithProviders(<CourseFormPage />, {
      path: '/teacher/courses/:id/edit',
      initialEntries: ['/teacher/courses/c1/edit'],
    });
  }

  it('loads the course into the form and shows the lessons section', async () => {
    getCourse.mockResolvedValue({ data: { data: { course } } });
    renderEdit();
    expect(await screen.findByRole('heading', { name: 'עריכת קורס' })).toBeInTheDocument();
    // The heading renders before the query resolves, so wait on the loaded value
    // itself rather than asserting synchronously against an empty form.
    await screen.findByDisplayValue('קורס קיים');
    expect(screen.getByText('שיעורים (1)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שמור שינויים' })).toBeInTheDocument();
  });
});
