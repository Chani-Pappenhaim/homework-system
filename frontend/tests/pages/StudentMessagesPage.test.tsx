import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import StudentMessagesPage from '@/pages/student/MessagesPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/messages.api', () => ({
  messagesApi: { getMine: vi.fn(), send: vi.fn(), markMineRead: vi.fn(), deleteMine: vi.fn() },
}));

import { messagesApi } from '@/api/messages.api';
const getMine = messagesApi.getMine as unknown as ReturnType<typeof vi.fn>;
const send = messagesApi.send as unknown as ReturnType<typeof vi.fn>;
const markMineRead = messagesApi.markMineRead as unknown as ReturnType<typeof vi.fn>;
const deleteMine = messagesApi.deleteMine as unknown as ReturnType<typeof vi.fn>;

function UrlProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}
const url = () => screen.getByTestId('url').textContent;

const twoConversations = {
  data: {
    data: {
      messages: [
        {
          id: 'm1', createdAt: '2026-07-01T10:00:00Z',
          entries: [{ id: 'e1', fromTeacher: true, content: 'תשובה ראשונה', isRead: false, createdAt: '2026-07-01T10:00:00Z' }],
        },
        {
          id: 'm2', createdAt: '2026-07-03T10:00:00Z',
          entries: [{ id: 'e2', fromTeacher: false, content: 'שיחה שנייה', isRead: true, createdAt: '2026-07-03T10:00:00Z' }],
        },
      ],
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  // jsdom has no layout; the open thread scrolls to its last entry.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('StudentMessagesPage', () => {
  // The compose form now lives in a dialog opened via "הודעה חדשה", not an
  // always-visible textarea on the page.
  it('renders the send form', async () => {
    getMine.mockResolvedValue({ data: { data: { messages: [] } } });
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    expect(screen.getByPlaceholderText('כתבי את ההודעה שלך...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שלחי' })).toBeInTheDocument();
  });

  it('renders message history with a conversation badge', async () => {
    getMine.mockResolvedValue({
      data: {
        data: {
          messages: [
            {
              id: 'm1',
              createdAt: '2026-07-01T10:00:00Z',
              entries: [
                { id: 'e1', fromTeacher: false, content: 'שאלה שלי', isRead: true, createdAt: '2026-07-01T10:00:00Z' },
                { id: 'e2', fromTeacher: true, content: 'התשובה', isRead: false, createdAt: '2026-07-02T10:00:00Z' },
              ],
            },
            {
              id: 'm2',
              createdAt: '2026-07-03T10:00:00Z',
              entries: [
                { id: 'e3', fromTeacher: false, content: 'הודעה נוספת', isRead: true, createdAt: '2026-07-03T10:00:00Z' },
              ],
            },
          ],
        },
      },
    });
    renderWithProviders(<StudentMessagesPage />);
    // The list preview shows each conversation's most recent entry.
    expect(await screen.findByText('התשובה')).toBeInTheDocument();
    expect(screen.getByText('בשיחה')).toBeInTheDocument();
    expect(screen.getByText('הודעה נוספת')).toBeInTheDocument();

    // Opening the conversation shows the full history, including the original message.
    await userEvent.click(screen.getByText('התשובה'));
    expect(await screen.findByText('שאלה שלי')).toBeInTheDocument();
  });

  it('disables the send button when the textarea is empty', async () => {
    getMine.mockResolvedValue({ data: { data: { messages: [] } } });
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    expect(screen.getByRole('button', { name: 'שלחי' })).toBeDisabled();
  });

  it('calls messagesApi.send with the typed content and closes the compose dialog', async () => {
    getMine.mockResolvedValue({ data: { data: { messages: [] } } });
    send.mockResolvedValue({ data: {} });
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    await userEvent.type(screen.getByPlaceholderText('כתבי את ההודעה שלך...'), 'שלום מורה');
    await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('שלום מורה'));
    await waitFor(() => expect(screen.queryByPlaceholderText('כתבי את ההודעה שלך...')).not.toBeInTheDocument());
  });

  describe('the address of the open conversation', () => {
    beforeEach(() => {
      getMine.mockResolvedValue(twoConversations);
      markMineRead.mockResolvedValue({ data: {} });
    });

    it('opens the conversation an email links to and marks it read', async () => {
      renderWithProviders(<><StudentMessagesPage /><UrlProbe /></>, { initialEntries: ['/?highlight=m1'] });
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByText('תשובה ראשונה')).toBeInTheDocument();
      await waitFor(() => expect(markMineRead).toHaveBeenCalledTimes(1));
      expect(markMineRead).toHaveBeenCalledWith('m1');
    });

    it('stays closed after closing, even when the list refreshes', async () => {
      const { queryClient } = renderWithProviders(<><StudentMessagesPage /><UrlProbe /></>, { initialEntries: ['/?highlight=m1'] });
      await screen.findByRole('dialog');
      await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'סגירה' }).at(-1)!);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(url()).toBe('');
      const fetches = getMine.mock.calls.length;
      await queryClient.invalidateQueries({ queryKey: ['my-messages'] });
      await waitFor(() => expect(getMine.mock.calls.length).toBeGreaterThan(fetches));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('gives each conversation and the new-message form an address of its own', async () => {
      renderWithProviders(<><StudentMessagesPage /><UrlProbe /></>);
      await userEvent.click(await screen.findByText('שיחה שנייה'));
      expect(url()).toBe('?highlight=m2');
      await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'סגירה' }).at(-1)!);
      await userEvent.click(screen.getByText('תשובה ראשונה'));
      expect(url()).toBe('?highlight=m1');
      await userEvent.click(within(screen.getByRole('dialog')).getAllByRole('button', { name: 'סגירה' }).at(-1)!);
      await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
      expect(url()).toBe('?compose=1');
    });

    it('marks a new teacher reply that arrives while the conversation is open', async () => {
      const { queryClient } = renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await waitFor(() => expect(markMineRead).toHaveBeenCalledTimes(1));
      const [m1, ...rest] = twoConversations.data.data.messages;
      const later = { ...m1, entries: [
        ...m1.entries.map((e) => ({ ...e, isRead: true })),
        { id: 'late', fromTeacher: true, content: 'עוד תשובה', isRead: false, createdAt: '2026-07-03T09:00:00Z' },
      ] };
      getMine.mockResolvedValue({ data: { data: { messages: [later, ...rest] } } });
      await queryClient.invalidateQueries({ queryKey: ['my-messages'] });
      await waitFor(() => expect(markMineRead).toHaveBeenCalledTimes(2));
    });

    it('shows the list for a link to a conversation that was deleted', async () => {
      renderWithProviders(<><StudentMessagesPage /><UrlProbe /></>, { initialEntries: ['/?highlight=gone'] });
      await screen.findByText('שיחה שנייה');
      await waitFor(() => expect(url()).toBe(''));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});

describe('StudentMessagesPage deleting a conversation', () => {
  it('asks in a styled dialog and deletes only after she confirms', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    getMine.mockResolvedValue(twoConversations);
    deleteMine.mockResolvedValue({ data: {} });
    renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=m1'] });
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: /מחקי שיחה/ }));
    expect(screen.getByText('למחוק את השיחה?')).toBeInTheDocument();
    expect(deleteMine).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(deleteMine).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /מחקי שיחה/ }));
    await userEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
    await waitFor(() => expect(deleteMine).toHaveBeenCalledWith('m1'));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});
