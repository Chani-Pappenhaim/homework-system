import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, MailX, ChevronLeft, Clock, Trash2, Plus, Send, X, Users } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { groupsApi } from '@/api/groups.api';
import { useToast } from '@/components/ui/toast';
import { MAX_MESSAGE_LENGTH } from '@/lib/limits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MarkdownField } from '@/components/ui/markdown-field';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSkeleton } from '@/components/ui/skeleton';
import { StudentAutocomplete } from '@/components/ui/student-autocomplete';
import { Input } from '@/components/ui/input';
import { EntryCard } from '@/components/messages/EntryCard';
import { SubjectField } from '@/components/messages/SubjectField';
import { ThreadTitleLine } from '@/components/messages/ThreadTitleLine';
import type { StudentSearchResult } from '@/api/students.api';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDateTime, groupDisplayName } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { MessageDetailDTO, MessageDTO, MessageEntryDTO, ThreadAudience } from '@/types';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMessageDialogs } from '@/hooks/useMessageDialogs';
import { threadQueryKey, useOpenThread, useToggleReaction } from '@/hooks/useOpenThread';
import { useConfirm } from '@/components/ui/use-confirm';

type GroupAudience = Exclude<ThreadAudience, 'DIRECT'>;

const AUDIENCE_CHOICES: { key: GroupAudience; label: string; hint: string }[] = [
  {
    key: 'GROUP_VISIBLE',
    label: 'גלוי לכולן',
    hint: 'כל התלמידות בקבוצה רואות את ההודעה, מי עוד קיבלה אותה, ואת התגובות של כולן.',
  },
  {
    key: 'GROUP_BCC',
    label: 'עותק מוסתר (BCC)',
    hint: 'כל תלמידה רואה שההודעה נשלחה לקבוצה, אבל לא מי עוד קיבלה אותה. התגובה שלה מגיעה רק אלייך.',
  },
];

const AUDIENCE_BADGE: Record<GroupAudience, string> = { GROUP_VISIBLE: 'גלוי לכולן', GROUP_BCC: 'עותק מוסתר' };

/** Whether a list row has anything from a student that could be marked unread. */
function hasStudentEntries(msg: MessageDTO) {
  return msg.replyCount > 0 || (msg.lastEntry !== null && !msg.lastEntry.fromTeacher);
}

function threadName(msg: Pick<MessageDTO, 'audience' | 'groupName' | 'student'>) {
  if (msg.audience === 'DIRECT') return msg.student?.name ?? '';
  return msg.groupName ?? 'קבוצה';
}

export default function TeacherMessagesPage() {
  usePageTitle('הודעות');
  const qc = useQueryClient();
  const [confirmDialog, ask] = useConfirm();
  const { openId, composeOpen, openConversation, closeConversation, setComposeOpen } = useMessageDialogs();
  const [replyText, setReplyText] = useState('');
  // Whom the reply in a group thread is for: everyone ('') or one student.
  const [replyTo, setReplyTo] = useState('');
  const [replySearch, setReplySearch] = useState('');
  const toast = useToast();
  const [composeStudent, setComposeStudent] = useState<StudentSearchResult | null>(null);
  // A new message goes to one student, or to every student of a group.
  const [composeTo, setComposeTo] = useState<'student' | 'group'>('student');
  const [composeGroupId, setComposeGroupId] = useState('');
  const [composeAudience, setComposeAudience] = useState<GroupAudience>('GROUP_BCC');
  const [composeSubject, setComposeSubject] = useState('');
  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: () => groupsApi.list(),
    enabled: composeOpen && composeTo === 'group',
  });
  const groups = groupsData?.data.data.groups ?? [];
  const [composeText, setComposeText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-messages'],
    queryFn: () => messagesApi.getAll(),
    refetchInterval: 15_000,
  });

  // The inbox badges (header bell, menu tab, the students' pages) count unread
  // entries on their own, so they refresh together with the list.
  function refreshAfterReadChange(id: string) {
    qc.invalidateQueries({ queryKey: ['teacher-messages'] });
    qc.invalidateQueries({ queryKey: ['unread-messages'] });
    qc.invalidateQueries({ queryKey: ['students'] });
    qc.invalidateQueries({ queryKey: threadQueryKey(id) });
  }

  const markReadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markRead(id),
    onSuccess: (_r, id) => refreshAfterReadChange(id),
  });

  const markUnreadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markUnread(id),
    onSuccess: (_r, id) => refreshAfterReadChange(id),
  });

  const { thread: openMsg, notFound } = useOpenThread(openId, (id) => markReadMutation.mutate(id));
  const toggleReaction = useToggleReaction(openId);

  const replyMutation = useMutation({
    mutationFn: ({ id, reply, toStudentId }: { id: string; reply: string; toStudentId: string }) =>
      messagesApi.reply(id, reply, toStudentId ? { toStudentId } : {}),
    onSuccess: (_r, { id }) => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      qc.invalidateQueries({ queryKey: threadQueryKey(id) });
      setReplyText('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => messagesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      closeConversation();
    },
  });

  const deleteReplyMutation = useMutation({
    mutationFn: (id: string) => messagesApi.deleteReply(id),
    onSuccess: (res, id) => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      // Taking back the thread's only entry deletes the thread, so there is nothing left to show.
      if (res.data.data.message === null) {
        closeConversation();
        return;
      }
      qc.invalidateQueries({ queryKey: threadQueryKey(id) });
      setReplyText('');
    },
  });

  const composeMutation = useMutation({
    mutationFn: async () => {
      const subject = composeSubject.trim() || undefined;
      if (composeTo === 'group') {
        return (await messagesApi.sendToGroup(composeGroupId, composeText, composeAudience, subject)).data.data.sent;
      }
      await messagesApi.sendTeacher(composeStudent!.id, composeText, subject);
      return 1;
    },
    onSuccess: (sent) => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      if (composeTo === 'group') toast.success(`ההודעה נשלחה ל-${sent} תלמידות, בשיחה אחת`);
      setComposeOpen(false);
      resetCompose();
    },
  });

  function resetCompose() {
    setComposeStudent(null);
    setComposeText('');
    setComposeSubject('');
    setComposeGroupId('');
    setComposeAudience('GROUP_BCC');
    setComposeTo('student');
  }

  const canSendCompose = Boolean((composeTo === 'group' ? composeGroupId : composeStudent) && composeText.trim());

  const messages: MessageDTO[] = unwrap(data)?.messages ?? [];

  async function confirmDelete(msg: Pick<MessageDTO, 'id' | 'audience' | 'groupName' | 'student'>) {
    const title = msg.audience === 'DIRECT'
      ? `למחוק את ההודעה מ"${threadName(msg)}"?`
      : `למחוק את ההודעה לקבוצה "${threadName(msg)}" לכל התלמידות?`;
    if (await ask({ title, description: 'הפעולה בלתי הפיכה.' })) deleteMutation.mutate(msg.id);
  }

  // A link to a conversation that no longer exists (deleted) just shows the list.
  useEffect(() => {
    if (openId && notFound) closeConversation();
  }, [openId, notFound, closeConversation]);

  useEffect(() => { setReplyText(''); setReplyTo(''); setReplySearch(''); }, [openId]);

  useEffect(() => {
    if (openId) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [openId, openMsg?.entries.length]);

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="הודעות מתלמידות"
        meta="תיבת דואר · נכנס"
        actions={<Button onClick={() => setComposeOpen(true)}><Plus size={14} /> הודעה חדשה</Button>}
      />

      {isLoading ? (
        <div className="sheet divide-y divide-rule overflow-hidden">
          {[...Array(5)].map((_, i) => <MessageSkeleton key={i} />)}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<Mail size={22} />}>אין הודעות</EmptyState>
      ) : (
        /* External list — sender + one-line preview + status. Full thread opens in an overlay. */
        <div className="sheet divide-y divide-rule overflow-hidden">
          {messages.map((msg) => {
            const unread = msg.unread;
            const isGroup = msg.audience !== 'DIRECT';
            return (
            <div key={msg.id} className="flex w-full items-stretch transition-colors hover:bg-butter/10">
              <button
                onClick={() => openConversation(msg.id)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-right"
              >
                <span
                  className={cn(
                    'grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold',
                    unread ? 'bg-clay text-sheet' : 'bg-ground text-ink-soft',
                  )}
                >
                  {isGroup ? <Users size={16} /> : msg.student?.name?.[0] ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('truncate text-sm', unread ? 'font-bold text-ink' : 'font-medium text-ink')}>
                      {threadName(msg)}
                    </span>
                    {unread && <span aria-label="לא נקרא" className="size-2 shrink-0 rounded-full bg-coral" />}
                    {isGroup && (
                      <Badge variant="muted" className="shrink-0">
                        {msg.participantCount} תלמידות · {AUDIENCE_BADGE[msg.audience as GroupAudience]}
                      </Badge>
                    )}
                    {msg.lastEntry?.fromTeacher && <Badge variant="secondary" className="shrink-0">שלחת</Badge>}
                    {msg.assignmentId && (
                      <Badge variant="warning" className="shrink-0"><Clock size={9} className="ml-1" /> בקשת הגשה</Badge>
                    )}
                  </div>
                  <ThreadTitleLine msg={msg} />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 ml-4">
                  <span className="text-[11px] text-ink-soft">{formatDateTime(msg.lastEntry?.createdAt ?? msg.createdAt)}</span>
                  <ChevronLeft size={16} className="text-ink-soft" />
                </div>
              </button>
              {!unread && hasStudentEntries(msg) && (
                <button
                  title="סמני כלא נקרא"
                  aria-label="סמני כלא נקרא"
                  onClick={() => markUnreadMutation.mutate(msg.id)}
                  className="shrink-0 px-3 py-4 text-ink-soft transition-colors hover:bg-butter/20 hover:text-ink flex items-center justify-center"
                >
                  <MailX size={16} />
                </button>
              )}
              <button
                title="מחקי שיחה"
                aria-label="מחקי שיחה"
                onClick={() => confirmDelete(msg)}
                className="shrink-0 px-3 py-4 text-ink-soft transition-colors hover:bg-coral/10 hover:text-coral flex items-center justify-center"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );})}
        </div>
      )}

      {/* Overlay: full conversation thread, blocking the list behind it */}
      <Dialog open={Boolean(openId)} onOpenChange={(o) => { if (!o) closeConversation(); }}>
        <DialogContent size="lg">
          {openMsg && (
            <>
              <DialogHeader>
                <DialogTitle>{openMsg.subject ?? threadName(openMsg)}</DialogTitle>
                <ThreadSubtitle thread={openMsg} />
                {openMsg.assignmentId && (
                  <span className="mt-2 inline-flex"><Badge variant="warning"><Clock size={10} className="ml-1" /> בקשת הגשה מאוחרת</Badge></span>
                )}
              </DialogHeader>

              <DialogBody className="space-y-3 max-h-96 overflow-y-auto">
                <TeacherEntries
                  thread={openMsg}
                  onReact={(entryId, emoji) => toggleReaction.mutate({ entryId, emoji })}
                  onReplyTo={setReplyTo}
                  onUnsend={async () => {
                    if (await ask({ title: 'למחוק את התגובה האחרונה שלך?' })) deleteReplyMutation.mutate(openMsg.id);
                  }}
                />
                <div ref={bottomRef} />

                <div className="space-y-2 pt-1">
                  {openMsg.participants && openMsg.audience !== 'DIRECT' && (
                    <div>
                      <label htmlFor="reply-to" className="label mb-1 block">למי התגובה</label>
                      {openMsg.participants.length > 5 && (
                        <Input
                          aria-label="חיפוש נמענת"
                          placeholder="חיפוש לפי שם"
                          value={replySearch}
                          onChange={(e) => setReplySearch(e.target.value)}
                          className="mb-2"
                        />
                      )}
                      <select
                        id="reply-to"
                        value={replyTo}
                        onChange={(e) => setReplyTo(e.target.value)}
                        className="w-full rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft focus:border-clay focus:outline-none"
                      >
                        <option value="">לכל הקבוצה</option>
                        {openMsg.participants
                          .filter((p) => p.id === replyTo || p.name.includes(replySearch.trim()))
                          .map((p) => (
                            <option key={p.id} value={p.id}>רק ל{p.name}</option>
                          ))}
                      </select>
                    </div>
                  )}
                  <MarkdownField
                    maxLength={MAX_MESSAGE_LENGTH}
                    label="כתיבת תגובה"
                    rows={4}
                    placeholder="כתבי תגובה…"
                    value={replyText}
                    onChange={setReplyText}
                    onSubmit={() => {
                      if (replyText.trim() && !replyMutation.isPending) {
                        replyMutation.mutate({ id: openMsg.id, reply: replyText, toStudentId: replyTo });
                      }
                    }}
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  loading={replyMutation.isPending}
                  disabled={!replyText.trim()}
                  onClick={() => replyMutation.mutate({ id: openMsg.id, reply: replyText, toStudentId: replyTo })}
                >
                  <Send size={14} /> שלחי
                </Button>
                <Button variant="outline" onClick={closeConversation}>
                  חזרה להודעות
                </Button>
                {openMsg.entries.some((e) => !e.fromTeacher) && (
                  <Button
                    variant="outline"
                    loading={markUnreadMutation.isPending}
                    // Closing keeps the thread from being marked read again straight away.
                    onClick={() => markUnreadMutation.mutate(openMsg.id, { onSuccess: closeConversation })}
                  >
                    <MailX size={14} /> סמני כלא נקרא
                  </Button>
                )}
                <Button
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onClick={() => confirmDelete(openMsg)}
                >
                  <Trash2 size={14} /> מחקי שיחה
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose: teacher starting a new conversation with a student or a group */}
      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) resetCompose(); }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{composeTo === 'group' ? 'הודעה חדשה לקבוצה' : 'הודעה חדשה לתלמידה'}</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="inline-flex rounded-lg border border-rule bg-sheet p-0.5" role="radiogroup" aria-label="למי">
              {([['student', 'לתלמידה'], ['group', 'לקבוצה']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={composeTo === key}
                  onClick={() => setComposeTo(key)}
                  className={cn('rounded-md px-3 py-1 text-xs font-semibold', composeTo === key ? 'bg-ink text-sheet' : 'text-ink/60 hover:text-ink')}
                >
                  {label}
                </button>
              ))}
            </div>
            {composeTo === 'group' ? (
              <>
                <div>
                  <label htmlFor="compose-group" className="label mb-1 block">קבוצה</label>
                  <select
                    id="compose-group"
                    value={composeGroupId}
                    onChange={(e) => setComposeGroupId(e.target.value)}
                    className="w-full rounded-input border border-rule bg-sheet px-3 py-2 text-sm text-ink shadow-soft focus:border-clay focus:outline-none"
                  >
                    <option value="">בחרי קבוצה...</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>{groupDisplayName(g)} ({g.studentCount} תלמידות)</option>
                    ))}
                  </select>
                </div>
                <fieldset>
                  <legend className="label mb-1">איך התלמידות רואות את ההודעה</legend>
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="סוג ההודעה לקבוצה">
                    {AUDIENCE_CHOICES.map((choice) => (
                      <label
                        key={choice.key}
                        className={cn(
                          'flex cursor-pointer items-start gap-2 rounded-input border px-3 py-2 text-sm',
                          composeAudience === choice.key ? 'border-clay bg-clay/5' : 'border-rule bg-sheet',
                        )}
                      >
                        <input
                          type="radio"
                          name="compose-audience"
                          className="mt-1"
                          checked={composeAudience === choice.key}
                          onChange={() => setComposeAudience(choice.key)}
                        />
                        <span>
                          <span className="block font-medium text-ink">{choice.label}</span>
                          <span className="block text-xs text-ink-soft">{choice.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : (
            <div>
              <div className="label mb-1">תלמידה</div>
              {composeStudent ? (
                <div className="flex items-center justify-between rounded-input border border-rule bg-ground/40 px-3 py-2">
                  <span className="text-sm text-ink">
                    <span className="font-medium">{composeStudent.name}</span>
                    <span className="text-ink/50"> · {composeStudent.email}</span>
                  </span>
                  <button
                    onClick={() => setComposeStudent(null)}
                    className="shrink-0 text-ink-soft transition-colors hover:text-coral"
                    title="הסרה"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <StudentAutocomplete onSelect={setComposeStudent} />
              )}
            </div>
            )}
            <SubjectField value={composeSubject} onChange={setComposeSubject} />
            <div>
              <MarkdownField
                    maxLength={MAX_MESSAGE_LENGTH}
                label="תוכן ההודעה"
                rows={5}
                placeholder={composeTo === 'group' ? 'כתבי הודעה לכל התלמידות בקבוצה…' : 'כתבי הודעה לתלמידה…'}
                value={composeText}
                onChange={setComposeText}
                onSubmit={() => { if (canSendCompose && !composeMutation.isPending) composeMutation.mutate(); }}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              loading={composeMutation.isPending}
              disabled={!canSendCompose}
              onClick={() => composeMutation.mutate()}
            >
              <Send size={14} /> שליחה
            </Button>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </div>
  );
}

/** Under the title of an open thread: who it is with, when it began, and who else got it. */
function ThreadSubtitle({ thread }: { thread: MessageDetailDTO }) {
  const isGroup = thread.audience !== 'DIRECT';
  return (
    <>
      <p className="mt-0.5 text-xs text-ink-soft">
        {isGroup
          ? `${threadName(thread)} · ${AUDIENCE_BADGE[thread.audience as GroupAudience]}`
          : `${thread.student?.name ?? ''} · ${thread.student?.email ?? ''}`}
        {' · '}{formatDateTime(thread.createdAt)}
      </p>
      {isGroup && thread.participants && (
        <details className="mt-1 text-xs text-ink-soft">
          <summary className="cursor-pointer">נשלח ל-{thread.participants.length} תלמידות</summary>
          <p className="mt-1">{thread.participants.map((p) => p.name).join(', ')}</p>
        </details>
      )}
    </>
  );
}

interface TeacherEntriesProps {
  thread: MessageDetailDTO;
  onReact: (entryId: string, emoji: string) => void;
  onReplyTo: (studentId: string) => void;
  onUnsend: () => void;
}

/**
 * The entries of an open thread. In a hidden-copy thread the exchanges with
 * each student are shown apart, since none of them knows about the others.
 */
function TeacherEntries({ thread, onReact, onReplyTo, onUnsend }: TeacherEntriesProps) {
  const names = new Map((thread.participants ?? []).map((p) => [p.id, p.name]));
  const lastId = thread.entries.at(-1)?.id;

  const card = (entry: MessageEntryDTO, inSection: boolean) => {
    const toName = entry.privateToStudentId ? names.get(entry.privateToStudentId) : undefined;
    const label = entry.fromTeacher ? 'התגובה שלך' : entry.authorName ?? 'התלמידה';
    const privateNote = inSection ? undefined : entry.fromTeacher ? `רק ל${toName ?? 'תלמידה'}` : 'רק אלייך';
    return (
      <EntryCard
        key={entry.id}
        entry={entry}
        label={label}
        privateNote={privateNote}
        onReact={(emoji) => onReact(entry.id, emoji)}
        action={entry.fromTeacher && entry.id === lastId ? (
          <button title="מחקי תגובה" aria-label="מחקי תגובה" onClick={onUnsend} className="shrink-0 text-ink-soft transition-colors hover:text-coral">
            <Trash2 size={13} />
          </button>
        ) : undefined}
      />
    );
  };

  if (thread.audience !== 'GROUP_BCC') return <>{thread.entries.map((e) => card(e, false))}</>;

  const shared = thread.entries.filter((e) => !e.isPrivate);
  const perStudent = new Map<string, MessageEntryDTO[]>();
  for (const e of thread.entries.filter((x) => x.isPrivate && x.privateToStudentId)) {
    perStudent.set(e.privateToStudentId!, [...(perStudent.get(e.privateToStudentId!) ?? []), e]);
  }
  return (
    <>
      {shared.map((e) => card(e, false))}
      {[...perStudent.entries()].map(([studentId, entries]) => (
        <section key={studentId} aria-label={`השיחה עם ${names.get(studentId) ?? 'תלמידה'}`} className="space-y-2 rounded-input border border-rule p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">השיחה עם {names.get(studentId) ?? 'תלמידה'}</h3>
            <button type="button" onClick={() => onReplyTo(studentId)} className="text-xs font-medium text-clay hover:underline">
              השיבי לה
            </button>
          </div>
          {entries.map((e) => card(e, true))}
        </section>
      ))}
    </>
  );
}
