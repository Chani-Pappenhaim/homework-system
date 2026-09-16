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

  it('renders message history with a teacher reply badge', async () => {
    getMine.mockResolvedValue({
      data: {
        data: {
          messages: [
            { id: 'm1', content: 'שאלה שלי', createdAt: '2026-07-01T10:00:00Z', replyContent: 'התשובה', repliedAt: '2026-07-02T10:00:00Z' },
            { id: 'm2', content: 'הודעה נוספת', createdAt: '2026-07-03T10:00:00Z' },
          ],
        },
      },
    });
    renderWithProviders(<StudentMessagesPage />);
    expect(await screen.findByText('שאלה שלי')).toBeInTheDocument();
    expect(screen.getByText('נענתה')).toBeInTheDocument();
    expect(screen.getByText('הודעה נוספת')).toBeInTheDocument();
    expect(screen.getByText('ממתינה')).toBeInTheDocument();

    // The reply content itself only shows once the message is opened.
    await userEvent.click(screen.getByText('שאלה שלי'));
    expect(await screen.findByText('התשובה')).toBeInTheDocument();
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
