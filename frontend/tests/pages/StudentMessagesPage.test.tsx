import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import StudentMessagesPage from '@/pages/student/MessagesPage';
import { renderWithProviders } from '../utils/render';
import { detail, entry, listRow, wrap } from '../utils/messageFixtures';

vi.mock('@/api/messages.api', () => ({
  messagesApi: {
    getMine: vi.fn(), getThread: vi.fn(), send: vi.fn(), studentReply: vi.fn(),
    markMineRead: vi.fn(), markMineUnread: vi.fn(), deleteMine: vi.fn(), toggleReaction: vi.fn(),
  },
}));

import { messagesApi } from '@/api/messages.api';
const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const getMine = mocked(messagesApi.getMine);
const getThread = mocked(messagesApi.getThread);
const send = mocked(messagesApi.send);
const studentReply = mocked(messagesApi.studentReply);
const markMineRead = mocked(messagesApi.markMineRead);
const markMineUnread = mocked(messagesApi.markMineUnread);
const deleteMine = mocked(messagesApi.deleteMine);
const toggleReaction = mocked(messagesApi.toggleReaction);

function UrlProbe() {
  const { search } = useLocation();
  return <output data-testid="url">{search}</output>;
}
const url = () => screen.getByTestId('url').textContent;

const teacherEntry = (id: string, content: string, isRead = false) =>
  entry({ id, fromTeacher: true, content, isRead });
const myEntry = (id: string, content: string) => entry({ id, mine: true, content });

const rowOne = listRow({
  id: 'm1', unread: true, unreadCount: 1, replyCount: 0,
  createdAt: '2026-07-01T10:00:00Z', lastEntry: teacherEntry('e1', 'תשובה ראשונה'),
});
const rowTwo = listRow({
  id: 'm2', createdAt: '2026-07-03T10:00:00Z', lastEntry: myEntry('e2', 'שיחה שנייה'),
});
const threads: Record<string, ReturnType<typeof detail>> = {
  m1: detail({ id: 'm1', unread: true }, [teacherEntry('e1', 'תשובה ראשונה')]),
  m2: detail({ id: 'm2' }, [myEntry('e2', 'שיחה שנייה')]),
};

function serve(rows = [rowOne, rowTwo]) {
  getMine.mockResolvedValue(wrap({ messages: rows }));
  getThread.mockImplementation(async (id: string) => {
    if (!threads[id]) throw new Error('404');
    return wrap({ message: threads[id] });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  markMineRead.mockResolvedValue({ data: {} });
  markMineUnread.mockResolvedValue({ data: {} });
  // jsdom has no layout; the open thread scrolls to its last entry.
  Element.prototype.scrollIntoView = vi.fn();
});

describe('StudentMessagesPage', () => {
  // The compose form lives in a dialog opened via "הודעה חדשה", not an
  // always-visible textarea on the page.
  it('renders the send form', async () => {
    getMine.mockResolvedValue(wrap({ messages: [] }));
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    expect(screen.getByPlaceholderText('כתבי את ההודעה שלך...')).toBeInTheDocument();
    expect(screen.getByLabelText('נושא (לא חובה)')).toHaveAttribute('maxlength', '120');
    expect(screen.getByRole('button', { name: 'שלחי' })).toBeInTheDocument();
  });

  it('lists each conversation by its newest entry, and the full history opens on click', async () => {
    const row = listRow({
      id: 'm1', replyCount: 1, lastEntry: teacherEntry('e2', 'התשובה', true),
    });
    getMine.mockResolvedValue(wrap({ messages: [row, rowTwo] }));
    getThread.mockResolvedValue(wrap({
      message: detail({ id: 'm1' }, [myEntry('e1', 'שאלה שלי'), teacherEntry('e2', 'התשובה', true)]),
    }));
    renderWithProviders(<StudentMessagesPage />);
    expect(await screen.findByText('התשובה')).toBeInTheDocument();
    expect(screen.getByText('תגובה אחת')).toBeInTheDocument();
    expect(screen.getByText('שיחה שנייה')).toBeInTheDocument();

    // Opening the conversation shows the full history, including the original message.
    await userEvent.click(screen.getByText('התשובה'));
    expect(await screen.findByText('שאלה שלי')).toBeInTheDocument();
  });

  it('shows the subject in bold instead of the snippet when the thread has one', async () => {
    getMine.mockResolvedValue(wrap({ messages: [listRow({ id: 'm1', subject: 'שאלה על המבחן', lastEntry: myEntry('e1', 'גוף ההודעה') })] }));
    renderWithProviders(<StudentMessagesPage />);
    const subject = await screen.findByText('שאלה על המבחן');
    expect(subject.className).toMatch(/font-(bold|semibold)/);
    expect(screen.queryByText('גוף ההודעה')).not.toBeInTheDocument();
  });

  it('disables the send button when the textarea is empty', async () => {
    getMine.mockResolvedValue(wrap({ messages: [] }));
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    expect(screen.getByRole('button', { name: 'שלחי' })).toBeDisabled();
  });

  it('calls messagesApi.send with the typed content and closes the compose dialog', async () => {
    getMine.mockResolvedValue(wrap({ messages: [] }));
    send.mockResolvedValue({ data: {} });
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    await userEvent.type(screen.getByPlaceholderText('כתבי את ההודעה שלך...'), 'שלום מורה');
    await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('שלום מורה', undefined, undefined));
    await waitFor(() => expect(screen.queryByPlaceholderText('כתבי את ההודעה שלך...')).not.toBeInTheDocument());
  });

  it('sends the trimmed subject with the message', async () => {
    getMine.mockResolvedValue(wrap({ messages: [] }));
    send.mockResolvedValue({ data: {} });
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    await userEvent.type(screen.getByLabelText('נושא (לא חובה)'), ' ארכה ');
    await userEvent.type(screen.getByPlaceholderText('כתבי את ההודעה שלך...'), 'שלום');
    await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('שלום', undefined, 'ארכה'));
  });

  it('sends on Ctrl+Enter, while Enter alone only breaks the line', async () => {
    getMine.mockResolvedValue(wrap({ messages: [] }));
    send.mockResolvedValue({ data: {} });
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    const box = screen.getByPlaceholderText('כתבי את ההודעה שלך...');
    await userEvent.type(box, 'שורה{Enter}עוד');
    expect(send).not.toHaveBeenCalled();
    await userEvent.type(box, '{Control>}{Enter}{/Control}');
    await waitFor(() => expect(send).toHaveBeenCalledWith(['שורה', 'עוד'].join('\n'), undefined, undefined));
  });

  it('starts the new message with the draft a "contact the teacher" link carried', async () => {
    getMine.mockResolvedValue(wrap({ messages: [] }));
    renderWithProviders(<StudentMessagesPage />, {
      initialEntries: [`/student/messages?compose=1&draft=${encodeURIComponent('בנוגע לחידון: ')}`],
    });
    expect(await screen.findByPlaceholderText('כתבי את ההודעה שלך...')).toHaveValue('בנוגע לחידון: ');
  });

  it('does not send an empty message on Ctrl+Enter', async () => {
    getMine.mockResolvedValue(wrap({ messages: [] }));
    renderWithProviders(<StudentMessagesPage />);
    await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
    await userEvent.type(screen.getByPlaceholderText('כתבי את ההודעה שלך...'), '{Control>}{Enter}{/Control}');
    expect(send).not.toHaveBeenCalled();
  });

  describe('the address of the open conversation', () => {
    beforeEach(() => serve());

    it('opens the conversation an email links to and marks it read', async () => {
      renderWithProviders(<><StudentMessagesPage /><UrlProbe /></>, { initialEntries: ['/?highlight=m1'] });
      const dialog = await screen.findByRole('dialog');
      expect(await within(dialog).findByText('תשובה ראשונה')).toBeInTheDocument();
      await waitFor(() => expect(markMineRead).toHaveBeenCalledTimes(1));
      expect(markMineRead).toHaveBeenCalledWith('m1');
    });

    it('stays closed after closing, even when the thread refreshes', async () => {
      const { queryClient } = renderWithProviders(<><StudentMessagesPage /><UrlProbe /></>, { initialEntries: ['/?highlight=m1'] });
      await screen.findByRole('dialog');
      await userEvent.click(await within(screen.getByRole('dialog')).findByRole('button', { name: 'חזרה להודעות' }));
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
      await userEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'חזרה להודעות' }));
      await userEvent.click(screen.getByText('תשובה ראשונה'));
      expect(url()).toBe('?highlight=m1');
      await userEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: 'חזרה להודעות' }));
      await userEvent.click(screen.getByRole('button', { name: /הודעה חדשה/ }));
      expect(url()).toBe('?compose=1');
    });

    it('marks a new teacher reply that arrives while the conversation is open', async () => {
      const { queryClient } = renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await waitFor(() => expect(markMineRead).toHaveBeenCalledTimes(1));
      threads.m1 = detail({ id: 'm1' }, [teacherEntry('e1', 'תשובה ראשונה', true), teacherEntry('late', 'עוד תשובה')]);
      await queryClient.invalidateQueries({ queryKey: ['message-thread', 'm1'] });
      await waitFor(() => expect(markMineRead).toHaveBeenCalledTimes(2));
      threads.m1 = detail({ id: 'm1', unread: true }, [teacherEntry('e1', 'תשובה ראשונה')]);
    });

    it('shows the list for a link to a conversation that was deleted', async () => {
      renderWithProviders(<><StudentMessagesPage /><UrlProbe /></>, { initialEntries: ['/?highlight=gone'] });
      await screen.findByText('שיחה שנייה');
      await waitFor(() => expect(url()).toBe(''));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('marking a conversation unread', () => {
    it('does it from the list row once the conversation is read', async () => {
      serve([listRow({ id: 'm1', unread: false, replyCount: 1, lastEntry: teacherEntry('e1', 'תשובה', true) })]);
      renderWithProviders(<StudentMessagesPage />);
      await userEvent.click(await screen.findByRole('button', { name: 'סמני כלא נקרא' }));
      await waitFor(() => expect(markMineUnread).toHaveBeenCalledWith('m1'));
    });

    it('does it inside the open conversation, and closes it so it is not read again', async () => {
      threads.m1 = detail({ id: 'm1' }, [teacherEntry('e1', 'תשובה ראשונה', true)]);
      serve([{ ...rowOne, unread: false }]);
      renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(await within(dialog).findByRole('button', { name: /סמני כלא נקרא/ }));
      await waitFor(() => expect(markMineUnread).toHaveBeenCalledWith('m1'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(markMineRead).not.toHaveBeenCalled();
      threads.m1 = detail({ id: 'm1', unread: true }, [teacherEntry('e1', 'תשובה ראשונה')]);
    });
  });

  describe('reactions', () => {
    it('toggles an emoji on the teacher\'s reply', async () => {
      serve();
      toggleReaction.mockResolvedValue(wrap({ reactions: [{ emoji: '❤️', count: 1, mine: true, names: ['אני'] }] }));
      renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await userEvent.click(await screen.findByRole('button', { name: 'הוספת תגובת אימוג׳י' }));
      await userEvent.click(screen.getByRole('button', { name: 'הגיבי ב-❤️' }));
      await waitFor(() => expect(toggleReaction).toHaveBeenCalledWith('m1', 'e1', '❤️'));
      expect(await screen.findByRole('button', { name: '❤️ 1, הוספת' })).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('replying', () => {
    it('replies in a direct conversation without any scope', async () => {
      serve();
      studentReply.mockResolvedValue({ data: {} });
      renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=m2'] });
      await userEvent.type(await screen.findByPlaceholderText('כתבי תגובה למורה…'), 'תודה');
      await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));
      await waitFor(() => expect(studentReply).toHaveBeenCalledWith('m2', 'תודה', {}));
      expect(screen.queryByRole('radiogroup', { name: 'למי התגובה' })).not.toBeInTheDocument();
    }, 15000);

    it('in a visible group thread, lets her answer everyone or only the teacher', async () => {
      threads.g = detail(
        { id: 'g', audience: 'GROUP_VISIBLE', groupName: 'כיתה יד', student: undefined, participants: [{ id: 's1', name: 'דנה' }, { id: 's2', name: 'רבקה' }], participantCount: 2 },
        [entry({ id: 'eg', fromTeacher: true, content: 'הודעה גלויה' })],
      );
      serve([listRow({ id: 'g', audience: 'GROUP_VISIBLE', groupName: 'כיתה יד', lastEntry: threads.g.entries[0] })]);
      studentReply.mockResolvedValue({ data: {} });
      renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=g'] });

      expect(await screen.findByText('נשלח ל-2 תלמידות')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('radio', { name: 'רק למורה' }));
      await userEvent.type(screen.getByPlaceholderText('כתבי תגובה למורה…'), 'שאלה פרטית');
      await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));
      await waitFor(() => expect(studentReply).toHaveBeenCalledWith('g', 'שאלה פרטית', { scope: 'TEACHER' }));
    }, 15000);

    it('in a hidden-copy thread, says the group got it and offers no scope choice', async () => {
      threads.b = detail(
        { id: 'b', audience: 'GROUP_BCC', groupName: 'כיתה יד', student: undefined, participants: null, participantCount: 12 },
        [entry({ id: 'eb', fromTeacher: true, content: 'הודעה מוסתרת' })],
      );
      serve([listRow({ id: 'b', audience: 'GROUP_BCC', groupName: 'כיתה יד', lastEntry: threads.b.entries[0] })]);
      renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=b'] });
      expect(await screen.findByText(/תגובה שלך תגיע רק למורה/)).toBeInTheDocument();
      expect(screen.queryByRole('radiogroup', { name: 'למי התגובה' })).not.toBeInTheDocument();
    });
  });
});

describe('StudentMessagesPage deleting a conversation', () => {
  it('asks in a styled dialog and deletes only after she confirms', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    serve();
    deleteMine.mockResolvedValue({ data: {} });
    renderWithProviders(<StudentMessagesPage />, { initialEntries: ['/?highlight=m1'] });
    await screen.findByRole('dialog');

    await userEvent.click(await screen.findByRole('button', { name: /מחקי שיחה/ }));
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
