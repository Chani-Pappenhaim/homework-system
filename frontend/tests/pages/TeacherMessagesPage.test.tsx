import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherMessagesPage from '@/pages/teacher/MessagesPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/messages.api', () => ({
  messagesApi: { getAll: vi.fn(), reply: vi.fn(), markRead: vi.fn() },
}));

import { messagesApi } from '@/api/messages.api';
const getAll = messagesApi.getAll as unknown as ReturnType<typeof vi.fn>;
const reply = messagesApi.reply as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

const messages = [
  {
    id: 'm1',
    content: 'שאלה מתלמידה',
    createdAt: '2026-07-01T09:00:00Z',
    isRead: false,
    student: { name: 'דנה', email: 'dana@x.com' },
  },
];

describe('TeacherMessagesPage', () => {
  it('renders messages from students with student name and content', async () => {
    getAll.mockResolvedValue({ data: { data: { messages } } });
    renderWithProviders(<TeacherMessagesPage />);
    expect(await screen.findByText('דנה')).toBeInTheDocument();
    expect(screen.getByText('שאלה מתלמידה')).toBeInTheDocument();
    expect(screen.getByText('חדש')).toBeInTheDocument();
  });

  it('shows the empty state when there are no messages', async () => {
    getAll.mockResolvedValue({ data: { data: { messages: [] } } });
    renderWithProviders(<TeacherMessagesPage />);
    expect(await screen.findByText('אין הודעות')).toBeInTheDocument();
  });

  it('opens the reply form and submits a reply', async () => {
    getAll.mockResolvedValue({ data: { data: { messages } } });
    reply.mockResolvedValue({ data: {} });
    renderWithProviders(<TeacherMessagesPage />);

    await userEvent.click(await screen.findByRole('button', { name: /הגיבי/ }));
    const textarea = screen.getByPlaceholderText('כתבי תגובה לתלמידה...');
    await userEvent.type(textarea, 'תשובה שלי');
    await userEvent.click(screen.getByRole('button', { name: 'שלחי תגובה' }));

    await waitFor(() => expect(reply).toHaveBeenCalledWith('m1', 'תשובה שלי'));
  });
});
