import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import TeacherMessagesPage from '@/pages/teacher/MessagesPage';
import { renderWithProviders } from '../utils/render';
import { detail, entry, listRow, wrap } from '../utils/messageFixtures';

vi.mock('@/api/messages.api', () => ({
  messagesApi: {
    getAll: vi.fn(),
    getThread: vi.fn(),
    reply: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    toggleReaction: vi.fn(),
    getUnreadCount: vi.fn(),
    delete: vi.fn(),
    deleteReply: vi.fn(),
    sendTeacher: vi.fn(),
    sendToGroup: vi.fn(),
  },
}));
vi.mock('@/api/groups.api', () => ({ groupsApi: { list: vi.fn() } }));
import { groupsApi } from '@/api/groups.api';
import { ToastProvider } from '@/components/ui/toast';
const groupsList = groupsApi.list as unknown as ReturnType<typeof vi.fn>;

import { messagesApi } from '@/api/messages.api';
const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;
const getAll = mocked(messagesApi.getAll);
const getThread = mocked(messagesApi.getThread);
const sendToGroup = mocked(messagesApi.sendToGroup);
const sendTeacher = mocked(messagesApi.sendTeacher);
const reply = mocked(messagesApi.reply);
const markRead = mocked(messagesApi.markRead);
const markUnread = mocked(messagesApi.markUnread);
const toggleReaction = mocked(messagesApi.toggleReaction);
const getUnreadCount = mocked(messagesApi.getUnreadCount);

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
  markUnread.mockResolvedValue({ data: {} });
  // jsdom has no layout; the open thread scrolls to its last entry.
  Element.prototype.scrollIntoView = vi.fn();
});

const studentEntry = (id: string, isRead = false) =>
  entry({ id, content: id === 'e1' ? 'שאלה מתלמידה' : `תוכן ${id}`, isRead, authorName: 'דנה' });

const row = listRow({
  id: 'm1',
  unread: true,
  unreadCount: 1,
  lastEntry: studentEntry('e1'),
});

function serve(rows = [row], thread = detail({ id: 'm1', unread: true }, [studentEntry('e1')])) {
  getAll.mockResolvedValue(wrap({ messages: rows }));
  getThread.mockResolvedValue(wrap({ message: thread }));
}

describe('TeacherMessagesPage', () => {
  it('renders messages from students with student name and content', async () => {
    serve();
    renderWithProviders(<TeacherMessagesPage />);
    expect(await screen.findByText('דנה')).toBeInTheDocument();
    expect(screen.getByText('שאלה מתלמידה')).toBeInTheDocument();
  });

  it('shows the empty state when there are no messages', async () => {
    getAll.mockResolvedValue(wrap({ messages: [] }));
    renderWithProviders(<TeacherMessagesPage />);
    expect(await screen.findByText('אין הודעות')).toBeInTheDocument();
  });

  it('opens the message and submits a reply', async () => {
    serve();
    reply.mockResolvedValue({ data: {} });
    renderWithProviders(<TeacherMessagesPage />);

    // Clicking the message row opens the full thread in an overlay dialog.
    await userEvent.click(await screen.findByRole('button', { name: /דנה/ }));
    const textarea = await screen.findByPlaceholderText('כתבי תגובה…');
    await userEvent.type(textarea, 'תשובה שלי');
    await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));

    await waitFor(() => expect(reply).toHaveBeenCalledWith('m1', 'תשובה שלי', {}));
    // Typing into the rich editor is slow when the whole suite runs in parallel.
  }, 15000);

  it('"back to messages" only closes the conversation - nothing is deleted and it stays listed', async () => {
    serve();
    renderWithProviders(<TeacherMessagesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /דנה/ }));
    await userEvent.click(await screen.findByRole('button', { name: 'חזרה להודעות' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(messagesApi.delete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /דנה/ })).toBeInTheDocument();
  });

  it('sends a reply on Ctrl+Enter', async () => {
    serve();
    reply.mockResolvedValue({ data: {} });
    renderWithProviders(<TeacherMessagesPage />);
    await userEvent.click(await screen.findByRole('button', { name: /דנה/ }));
    const textarea = await screen.findByPlaceholderText('כתבי תגובה…');
    await userEvent.type(textarea, 'תשובה{Control>}{Enter}{/Control}');
    await waitFor(() => expect(reply).toHaveBeenCalledWith('m1', 'תשובה', {}));
  }, 15000);

  describe('the list rows', () => {
    it('shows the subject in bold, and a muted snippet when there is none', async () => {
      serve([
        listRow({ id: 'a', subject: 'שאלה על התרגיל', lastEntry: studentEntry('e1') }),
        listRow({ id: 'b', student: { id: 's2', name: 'רבקה', email: 'r@x.com' }, lastEntry: entry({ id: 'e9', content: 'קטע ללא נושא' }) }),
      ]);
      renderWithProviders(<TeacherMessagesPage />);
      const subject = await screen.findByText('שאלה על התרגיל');
      expect(subject.className).toMatch(/font-(bold|semibold)/);
      const snippet = screen.getByText('קטע ללא נושא');
      expect(snippet.className).not.toMatch(/font-(bold|semibold)/);
    });

    it('counts the replies, and says nothing for a thread without any', async () => {
      serve([
        listRow({ id: 'a', replyCount: 1, lastEntry: studentEntry('e1') }),
        listRow({ id: 'b', replyCount: 3, student: { id: 's2', name: 'רבקה', email: 'r@x.com' }, lastEntry: studentEntry('e2') }),
        listRow({ id: 'c', replyCount: 0, student: { id: 's3', name: 'חנה', email: 'h@x.com' }, lastEntry: studentEntry('e3') }),
      ]);
      renderWithProviders(<TeacherMessagesPage />);
      expect(await screen.findByText('תגובה אחת')).toBeInTheDocument();
      expect(screen.getByText('3 תגובות')).toBeInTheDocument();
      expect(screen.queryByText('0 תגובות')).not.toBeInTheDocument();
    });

    it('shows a group thread once, with the group name and how many students got it', async () => {
      serve([
        listRow({
          id: 'g', audience: 'GROUP_BCC', groupId: 'g1', groupName: 'כיתה יד', participantCount: 12,
          student: undefined, lastEntry: entry({ id: 'eg', fromTeacher: true, mine: true, content: 'הודעה לכולן' }),
        }),
      ]);
      renderWithProviders(<TeacherMessagesPage />);
      expect(await screen.findByText('כיתה יד')).toBeInTheDocument();
      expect(screen.getByText(/12 תלמידות · עותק מוסתר/)).toBeInTheDocument();
    });

    it('marks a read thread unread from the row, and offers it only once it is read', async () => {
      serve([listRow({ id: 'm1', unread: false, replyCount: 1, lastEntry: studentEntry('e1', true) })]);
      renderWithProviders(<TeacherMessagesPage />);
      await userEvent.click(await screen.findByRole('button', { name: 'סמני כלא נקרא' }));
      await waitFor(() => expect(markUnread).toHaveBeenCalledWith('m1'));
    });

    it('offers no mark-unread on a thread that is already unread', async () => {
      serve();
      renderWithProviders(<TeacherMessagesPage />);
      await screen.findByText('דנה');
      expect(screen.queryByRole('button', { name: 'סמני כלא נקרא' })).not.toBeInTheDocument();
    });
  });

  describe('an open thread', () => {
    it('marks it unread and closes it, so the open thread does not read it again', async () => {
      serve([row], detail({ id: 'm1' }, [studentEntry('e1', true)]));
      renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(await within(dialog).findByRole('button', { name: /סמני כלא נקרא/ }));
      await waitFor(() => expect(markUnread).toHaveBeenCalledWith('m1'));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(markRead).not.toHaveBeenCalled();
    });

    it('toggles a reaction on an entry', async () => {
      serve([row], detail({ id: 'm1' }, [studentEntry('e1', true)]));
      toggleReaction.mockResolvedValue(wrap({ reactions: [{ emoji: '👍', count: 1, mine: true, names: ['את'] }] }));
      renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await userEvent.click(await screen.findByRole('button', { name: 'הוספת תגובת אימוג׳י' }));
      await userEvent.click(screen.getByRole('button', { name: 'הגיבי ב-👍' }));
      await waitFor(() => expect(toggleReaction).toHaveBeenCalledWith('m1', 'e1', '👍'));
      expect(await screen.findByRole('button', { name: '👍 1, הוספת' })).toHaveAttribute('aria-pressed', 'true');
    });

    it('shows a hidden-copy thread apart per student, and replies to one student only', async () => {
      const thread = detail(
        {
          id: 'g', audience: 'GROUP_BCC', groupName: 'כיתה יד', student: undefined,
          participants: [{ id: 's1', name: 'דנה' }, { id: 's2', name: 'רבקה' }],
          participantCount: 2,
        },
        [
          entry({ id: 'eg', fromTeacher: true, mine: true, content: 'הודעה לכולן' }),
          entry({ id: 'r1', authorName: 'דנה', isPrivate: true, privateToStudentId: 's1', content: 'תשובה של דנה' }),
          entry({ id: 'r2', authorName: 'רבקה', isPrivate: true, privateToStudentId: 's2', content: 'תשובה של רבקה' }),
        ],
      );
      serve([listRow({ id: 'g', audience: 'GROUP_BCC', groupName: 'כיתה יד', student: undefined, lastEntry: thread.entries[2] })], thread);
      reply.mockResolvedValue({ data: {} });
      renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=g'] });

      const danaSection = await screen.findByRole('region', { name: 'השיחה עם דנה' });
      expect(within(danaSection).getByText('תשובה של דנה')).toBeInTheDocument();
      expect(within(danaSection).queryByText('תשובה של רבקה')).not.toBeInTheDocument();

      await userEvent.click(within(danaSection).getByRole('button', { name: 'השיבי לה' }));
      expect(screen.getByLabelText('למי התגובה')).toHaveValue('s1');
      await userEvent.type(screen.getByPlaceholderText('כתבי תגובה…'), 'תודה');
      await userEvent.click(screen.getByRole('button', { name: 'שלחי' }));
      await waitFor(() => expect(reply).toHaveBeenCalledWith('g', 'תודה', { toStudentId: 's1' }));
    }, 15000);

    it('searches the recipients of a large group when choosing who to reply to', async () => {
      const names = ['דנה', 'רבקה', 'שרה', 'לאה', 'חנה', 'מירי'];
      const thread = detail(
        {
          id: 'g', audience: 'GROUP_BCC', groupName: 'כיתה יד', student: undefined,
          participants: names.map((name, i) => ({ id: `s${i}`, name })),
          participantCount: names.length,
        },
        [entry({ id: 'eg', fromTeacher: true, mine: true, content: 'הודעה לכולן' })],
      );
      serve([listRow({ id: 'g', audience: 'GROUP_BCC', groupName: 'כיתה יד', student: undefined, lastEntry: thread.entries[0] })], thread);
      renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=g'] });

      const select = await screen.findByLabelText('למי התגובה');
      expect(within(select).getAllByRole('option')).toHaveLength(7);
      await userEvent.type(screen.getByLabelText('חיפוש נמענת'), 'רב');
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['לכל הקבוצה', 'רק לרבקה']);
    }, 15000);

    it('lists who got a visible group message', async () => {
      const thread = detail(
        { id: 'g', audience: 'GROUP_VISIBLE', groupName: 'כיתה יד', student: undefined, participants: [{ id: 's1', name: 'דנה' }, { id: 's2', name: 'רבקה' }], participantCount: 2 },
        [entry({ id: 'eg', fromTeacher: true, mine: true, content: 'הודעה גלויה' })],
      );
      serve([listRow({ id: 'g', audience: 'GROUP_VISIBLE', groupName: 'כיתה יד', student: undefined, lastEntry: thread.entries[0] })], thread);
      renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=g'] });
      expect(await screen.findByText('נשלח ל-2 תלמידות')).toBeInTheDocument();
      expect(screen.getByText('דנה, רבקה')).toBeInTheDocument();
    });
  });

  describe('the unread badges', () => {
    it('clears the header badge as soon as the conversation is read, not a minute later', async () => {
      serve();
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
      serve();
      const { queryClient } = renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
      await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['students'] }));
    });

    it('marks a new message that arrives while the conversation is open', async () => {
      serve();
      const { queryClient } = renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));

      getThread.mockResolvedValue(wrap({ message: detail({ id: 'm1' }, [studentEntry('e1', true), studentEntry('e2')]) }));
      await queryClient.invalidateQueries({ queryKey: ['message-thread', 'm1'] });
      await waitFor(() => expect(markRead).toHaveBeenCalledTimes(2));
    });

    it('does not mark the same message twice when the thread refreshes before the mark lands', async () => {
      serve();
      const { queryClient } = renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/?highlight=m1'] });
      await waitFor(() => expect(markRead).toHaveBeenCalledTimes(1));
      const fetches = getThread.mock.calls.length;
      await queryClient.invalidateQueries({ queryKey: ['message-thread', 'm1'] });
      await waitFor(() => expect(getThread.mock.calls.length).toBeGreaterThan(fetches));
      expect(markRead).toHaveBeenCalledTimes(1);
    });
  });
});

describe('a message to a whole group', () => {
  async function pickGroup(user: ReturnType<typeof userEvent.setup>) {
    getAll.mockResolvedValue(wrap({ messages: [] }));
    groupsList.mockResolvedValue({ data: { data: { groups: [{ id: 'g1', name: 'יד', seminar: 'סמינר', year: 'תשפ״ז', studentCount: 12 }] } } });
    sendToGroup.mockResolvedValue({ data: { data: { sent: 12 } } });
    renderWithProviders(<ToastProvider><TeacherMessagesPage /></ToastProvider>, { initialEntries: ['/teacher/messages?compose=1'] });
    await user.click(await screen.findByRole('radio', { name: 'לקבוצה' }));
    await user.selectOptions(await screen.findByLabelText('קבוצה'), 'g1');
  }

  it('sends one hidden-copy message by default, and says how many students got it', async () => {
    const user = userEvent.setup();
    await pickGroup(user);
    await user.type(screen.getByPlaceholderText('כתבי הודעה לכל התלמידות בקבוצה…'), 'שיעור מחר מבוטל');
    await user.click(screen.getByRole('button', { name: /שליחה/ }));

    await waitFor(() => expect(sendToGroup).toHaveBeenCalledWith('g1', 'שיעור מחר מבוטל', 'GROUP_BCC', undefined));
    expect(await screen.findByText(/ההודעה נשלחה ל-12 תלמידות/)).toBeInTheDocument();
  }, 15000);

  it('sends a visible message with a subject when the teacher chooses so', async () => {
    const user = userEvent.setup();
    await pickGroup(user);
    await user.click(screen.getByRole('radio', { name: /גלוי לכולן/ }));
    await user.type(screen.getByLabelText('נושא (לא חובה)'), '  שינוי מועד ');
    await user.type(screen.getByPlaceholderText('כתבי הודעה לכל התלמידות בקבוצה…'), 'מחר ב-10');
    await user.click(screen.getByRole('button', { name: /שליחה/ }));

    await waitFor(() => expect(sendToGroup).toHaveBeenCalledWith('g1', 'מחר ב-10', 'GROUP_VISIBLE', 'שינוי מועד'));
  }, 15000);

  it('limits the subject to 120 characters', async () => {
    getAll.mockResolvedValue(wrap({ messages: [] }));
    renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/teacher/messages?compose=1'] });
    expect(await screen.findByLabelText('נושא (לא חובה)')).toHaveAttribute('maxlength', '120');
  });

  it('keeps the send button off for a direct message until a student is chosen', async () => {
    getAll.mockResolvedValue(wrap({ messages: [] }));
    sendTeacher.mockResolvedValue({ data: {} });
    renderWithProviders(<TeacherMessagesPage />, { initialEntries: ['/teacher/messages?compose=1'] });
    // A direct message needs a student first; the form keeps the send button off until then.
    expect(await screen.findByRole('button', { name: /שליחה/ })).toBeDisabled();
  });
});
