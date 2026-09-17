import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import StudentMessagesPage from '@/pages/student/MessagesPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/messages.api', () => ({
  messagesApi: { getMine: vi.fn(), send: vi.fn() },
}));

import { messagesApi } from '@/api/messages.api';
const getMine = messagesApi.getMine as unknown as ReturnType<typeof vi.fn>;
const send = messagesApi.send as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

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
});
