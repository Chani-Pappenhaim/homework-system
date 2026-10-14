import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import TeacherMessagesPage from '@/pages/teacher/MessagesPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/messages.api', () => ({
  messagesApi: {
    getAll: vi.fn(),
    reply: vi.fn(),
    markRead: vi.fn(),
    getUnreadCount: vi.fn(),
    delete: vi.fn(),
    deleteReply: vi.fn(),
    sendTeacher: vi.fn(),
  },
}));

import { messagesApi } from '@/api/messages.api';
const getAll = messagesApi.getAll as unknown as ReturnType<typeof vi.fn>;
const reply = messagesApi.reply as unknown as ReturnType<typeof vi.fn>;
const markRead = messagesApi.markRead as unknown as ReturnType<typeof vi.fn>;
const getUnreadCount = messagesApi.getUnreadCount as unknown as ReturnType<typeof vi.fn>;

/** The header's unread badge, as TeacherLayout queries it (refreshing on its own only once a minute). */
function UnreadBadge() {
  const { data } = useQuery({
    queryKey: ['unread-messages'],
    queryFn: () => messagesApi.getUnreadCount(),
    refetchInterval: 60_000,
  });
  return <span data-testid="badge">{(data as any)?.data?.data?.count ?? '…'}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  markRead.mockResolvedValue({ data: {} });
  // jsdom has no layout; the open thread scrolls to its last entry.
  Element.prototype.scrollIntoView = vi.fn();
});

const messages = [
  {
    id: 'm1',
    createdAt: '2026-07-01T09:00:00Z',
    entries: [
      { id: 'e1', fromTeacher: false, content: 'שאלה מתלמידה', isRead: false, createdAt: '2026-07-01T09:00:00Z' },
    ],
    student: { name: 'דנה', email: 'dana@x.com' },
  },
];

describe('TeacherMessagesPage', () => {
  it('renders messages from students with student name and content', async () => {
    getAll.mockResolvedValue({ data: { data: { messages } } });
    renderWithProviders(<TeacherMessagesPage />);
    expect(await screen.findByText('דנה')).toBeInTheDocument();
    expect(screen.getByText('שאלה מתלמידה')).toBeInTheDocument();
  });

  it('shows the empty state when there are no messages', async () => {
    getAll.mockResolvedValue({ data: { data: { messages: [] } } });
    renderWithProviders(<TeacherMessagesPage />);
    expect(await screen.findByText('אין הודעות')).toBeInTheDocument();
  });

  it('opens the message and submits a reply', async () => {
    getAll.mockResolvedValue({ data: { data: { messages } } });
    reply.mockResolvedValue({ data: {} });
    renderWithProviders(<TeacherMessagesPage />);

    // Clicking the message row opens the full thread in an overlay dialog.
    await userEvent.click(await screen.findByRole('button', { name: /דנה/ }));
    const textarea = await screen.findByPlaceholderText('כתבי תגובה לתלמידה…', {}, { timeout: 5000 });
    await userEvent.type(textarea, 'תשובה שלי');
    await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));

    await waitFor(() => expect(reply).toHaveBeenCalledWith('m1', 'תשובה שלי'));
    // Typing into the rich editor is slow when the whole suite runs in parallel.
  }, 15000);

  describe('the unread badges', () => {
    const entry = (id: string, isRead = false) =>
      ({ id, fromTeacher: false, content: `תוכן ${id}`, isRead, createdAt: '2026-07-01T09:00:00Z' });
    const conversation = (...entries: ReturnType<typeof entry>[]) =>
      ({ data: { data: { messages: [{ ...messages[0], entries }] } } });

    it('clears the header badge as soon as the conversation is read, not a minute later', async () => {
      getAll.mockResolvedValue(conversation(entry('e1')));
      let unread = 1;
      getUnreadCount.mockImplementation(async () => ({ data: { data: { count: unread } } }));
      // The mark lands only once the badge has shown the unread message.
      let land!: () => void;
      markRead.mockImplementation(() => new Promise((resolve) => {
        land = () => { unread = 0; resolve({ data: {} }); };
      }));

      renderWithProviders(<><TeacherMessagesPage /><UnreadBadge /></>, { initialEntries: ['/?highlight=m1'] });
      await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('1'));
      await waitFor(() => expect(markRead).toHaveBeenCalledWith('m1'));
      land();
      await waitFor(() => expect(screen.getByTestId('badge')).toHaveTextContent('0'));
    });

    it('also refreshes the students pages, which show their own unread marks', async () => {
      getAll.mockResolvedValue(conversation(entry('e1')));
      const { queryClient } = renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['students'] }));
    });

    it('marks a new message that arrives while the conversation is open', async () => {
      getAll.mockResolvedValue(conversation(entry('e1')));
      const { queryClient } = renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));

      getAll.mockResolvedValue(conversation(entry('e1', true), entry('e2')));
      await queryClient.invalidateQueries({ queryKey: ['teacher-messages'] });
      await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    });

    it('does not mark the same message twice when the list refreshes before the mark lands', async () => {
      getAll.mockResolvedValue(conversation(entry('e1')));
      const { queryClient } = renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));
      const fetches = getAll.mock.calls.length;
      await queryClient.invalidateQueries({ queryKey: ['teacher-messages'] });
      await waitFor(() => expect(getAll.mock.calls.length).toBeGreaterThan(fetches));
      expect(markRead).toHaveBeenCalledTimes(1);
    });
  });
});
