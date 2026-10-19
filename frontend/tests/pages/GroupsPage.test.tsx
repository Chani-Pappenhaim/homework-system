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
  groupsApi: { list: vi.fn(), delete: vi.fn() },
}));

import { groupsApi } from '@/api/groups.api';
const listMock = groupsApi.list as unknown as ReturnType<typeof vi.fn>;
const deleteMock = groupsApi.delete as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const groups = [
  { id: 'g1', name: 'קבוצה א', seminar: 'סמינר X', year: '2026', createdAt: '', studentCount: 12, courseCount: 3 },
  { id: 'g2', name: 'קבוצה ב', year: '2025', createdAt: '', studentCount: 5, courseCount: 0 },
];

describe('GroupsPage', () => {
  it('renders a card for each group', async () => {
    listMock.mockResolvedValue({ data: { data: { groups } } });
    renderWithProviders(<GroupsPage />);
    expect(await screen.findByText('סמינר X קבוצה א 2026')).toBeInTheDocument();
    expect(screen.getByText('קבוצה ב 2025')).toBeInTheDocument();
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
    await screen.findByText('סמינר X קבוצה א 2026');
    const viewButtons = screen.getAllByRole('button', { name: /צפייה/ });
    await userEvent.click(viewButtons[0]);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher/groups/g1'));
  });

  describe('searching', () => {
    it('finds a group by any part of its name - seminar, name or year', async () => {
      listMock.mockResolvedValue({ data: { data: { groups } } });
      renderWithProviders(<GroupsPage />);
      await screen.findByText('סמינר X קבוצה א 2026');
      const box = screen.getByRole('textbox', { name: 'חיפוש קבוצה' });

      await userEvent.type(box, 'סמינר x');
      expect(screen.getByText('סמינר X קבוצה א 2026')).toBeInTheDocument();
      expect(screen.queryByText('קבוצה ב 2025')).not.toBeInTheDocument();

      await userEvent.clear(box);
      await userEvent.type(box, '2025');
      expect(screen.getByText('קבוצה ב 2025')).toBeInTheDocument();
      expect(screen.queryByText('סמינר X קבוצה א 2026')).not.toBeInTheDocument();
    });

    it('says when nothing matches, and the clear button brings every group back', async () => {
      listMock.mockResolvedValue({ data: { data: { groups } } });
      renderWithProviders(<GroupsPage />);
      await screen.findByText('סמינר X קבוצה א 2026');
      await userEvent.type(screen.getByRole('textbox', { name: 'חיפוש קבוצה' }), 'אין כזו');
      expect(screen.getByText('אין קבוצות שמתאימות ל"אין כזו"')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'ניקוי החיפוש' }));
      expect(screen.getByText('סמינר X קבוצה א 2026')).toBeInTheDocument();
      expect(screen.getByText('קבוצה ב 2025')).toBeInTheDocument();
    });
  });

  describe('editing and deleting straight from the list', () => {
    it('opens the edit form from the card', async () => {
      listMock.mockResolvedValue({ data: { data: { groups } } });
      renderWithProviders(<GroupsPage />);
      await screen.findByText('סמינר X קבוצה א 2026');
      await userEvent.click(screen.getAllByRole('button', { name: /עריכה/ })[1]);
      expect(navigate).toHaveBeenCalledWith('/teacher/groups/g2/edit');
    });

    it('deletes a group only once she confirms, warning how many courses go with it', async () => {
      listMock.mockResolvedValue({ data: { data: { groups } } });
      deleteMock.mockResolvedValue({ data: {} });
      renderWithProviders(<GroupsPage />);
      await screen.findByText('סמינר X קבוצה א 2026');

      await userEvent.click(screen.getByRole('button', { name: 'מחיקת הקבוצה סמינר X קבוצה א 2026' }));
      expect(await screen.findByText('למחוק את הקבוצה "סמינר X קבוצה א 2026"?')).toBeInTheDocument();
      expect(screen.getByText(/כל 3 הקורסים של הקבוצה/)).toBeInTheDocument();
      expect(deleteMock).not.toHaveBeenCalled();

      await userEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
      await waitFor(() => expect(deleteMock).toHaveBeenCalledWith('g1'));
      // The list refreshes; she stays on it.
      await waitFor(() => expect(listMock).toHaveBeenCalledTimes(2));
      expect(navigate).not.toHaveBeenCalled();
    });

    it('keeps the group when she cancels', async () => {
      listMock.mockResolvedValue({ data: { data: { groups } } });
      renderWithProviders(<GroupsPage />);
      await screen.findByText('סמינר X קבוצה א 2026');
      await userEvent.click(screen.getByRole('button', { name: 'מחיקת הקבוצה סמינר X קבוצה א 2026' }));
      await userEvent.click(await screen.findByRole('button', { name: 'ביטול' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(deleteMock).not.toHaveBeenCalled();
    });

    it('does not mention courses for a group that has none', async () => {
      listMock.mockResolvedValue({ data: { data: { groups } } });
      renderWithProviders(<GroupsPage />);
      await screen.findByText('קבוצה ב 2025');
      await userEvent.click(screen.getByRole('button', { name: 'מחיקת הקבוצה קבוצה ב 2025' }));
      await screen.findByText('למחוק את הקבוצה "קבוצה ב 2025"?');
      expect(screen.queryByText(/הקורסים של הקבוצה/)).not.toBeInTheDocument();
    });
  });
});
