import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherMessagesPage from '@/pages/teacher/MessagesPage';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/messages.api', () => ({
  messagesApi: {
    getAll: vi.fn(),
    reply: vi.fn(),
    markRead: vi.fn(),
    delete: vi.fn(),
    deleteReply: vi.fn(),
    sendTeacher: vi.fn(),
  },
}));

import { messagesApi } from '@/api/messages.api';
const getAll = messagesApi.getAll as unknown as ReturnType<typeof vi.fn>;
const reply = messagesApi.reply as unknown as ReturnType<typeof vi.fn>;
const markRead = messagesApi.markRead as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  markRead.mockResolvedValue({ data: {} });
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
    const textarea = await screen.findByPlaceholderText('כתבי תגובה לתלמידה…');
    await userEvent.type(textarea, 'תשובה שלי');
    await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));

    await waitFor(() => expect(reply).toHaveBeenCalledWith('m1', 'תשובה שלי'));
  });
});
