import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GroupsPage from '@/pages/teacher/GroupsPage';
import { renderWithProviders } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/groups.api', () => ({
  groupsApi: { list: vi.fn() },
}));

import { groupsApi } from '@/api/groups.api';
const listMock = groupsApi.list as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const groups = [
  { id: 'g1', name: 'קבוצה א', seminar: 'סמינר X', year: '2026', createdAt: '', studentCount: 12 },
  { id: 'g2', name: 'קבוצה ב', year: '2025', createdAt: '', studentCount: 5 },
];

describe('GroupsPage', () => {
  it('renders a card for each group', async () => {
    listMock.mockResolvedValue({ data: { data: { groups } } });
    renderWithProviders(<GroupsPage />);
    expect(await screen.findByText('קבוצה א')).toBeInTheDocument();
    expect(screen.getByText('קבוצה ב')).toBeInTheDocument();
    expect(screen.getByText('סמינר X')).toBeInTheDocument();
    expect(screen.getByText('12 תלמידות')).toBeInTheDocument();
  });

  it('shows the empty state when there are no groups', async () => {
    listMock.mockResolvedValue({ data: { data: { groups: [] } } });
    renderWithProviders(<GroupsPage />);
    expect(await screen.findByText('אין קבוצות עדיין')).toBeInTheDocument();
  });

  it('navigates to the new-group page when clicking the "new group" button', async () => {
    listMock.mockResolvedValue({ data: { data: { groups: [] } } });
    renderWithProviders(<GroupsPage />);
    await screen.findByText('אין קבוצות עדיין');
    await userEvent.click(screen.getByRole('button', { name: /קבוצה חדשה/ }));
    expect(navigate).toHaveBeenCalledWith('/teacher/groups/new');
  });

  it('opens the group view (not the edit form) from its card', async () => {
    listMock.mockResolvedValue({ data: { data: { groups } } });
    renderWithProviders(<GroupsPage />);
    await screen.findByText('קבוצה א');
    const viewButtons = screen.getAllByRole('button', { name: /צפייה/ });
    await userEvent.click(viewButtons[0]);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher/groups/g1'));
  });
});
