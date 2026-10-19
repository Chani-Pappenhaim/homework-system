import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Mail, ChevronLeft, Clock, Trash2, Plus, Send, X } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { groupsApi } from '@/api/groups.api';
import { useToast } from '@/components/ui/toast';
import { MAX_MESSAGE_LENGTH } from '@/lib/limits';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MarkdownField } from '@/components/ui/markdown-field';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSkeleton } from '@/components/ui/skeleton';
import { StudentAutocomplete } from '@/components/ui/student-autocomplete';
import type { StudentSearchResult } from '@/api/students.api';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDateTime, groupDisplayName, markdownToPlainText } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { MessageDTO } from '@/types';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMessageDialogs } from '@/hooks/useMessageDialogs';
import { useConfirm } from '@/components/ui/use-confirm';

export default function TeacherMessagesPage() {
  usePageTitle('הודעות');
  const qc = useQueryClient();
  const [confirmDialog, ask] = useConfirm();
  const { openId, composeOpen, openConversation, closeConversation, setComposeOpen } = useMessageDialogs();
  const [replyText, setReplyText] = useState('');
  const toast = useToast();
  const [composeStudent, setComposeStudent] = useState<StudentSearchResult | null>(null);
  // A new message goes to one student, or to every student of a group.
  const [composeTo, setComposeTo] = useState<'student' | 'group'>('student');
  const [composeGroupId, setComposeGroupId] = useState('');
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

  const markReadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markRead(id),
    // The inbox badges (header bell, menu tab, the students' pages) count
    // unread entries on their own, so they refresh together with the list.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      qc.invalidateQueries({ queryKey: ['unread-messages'] });
      qc.invalidateQueries({ queryKey: ['students'] });
    },
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) => messagesApi.reply(id, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      setReplyText('');
    },
  });

  const composeMutation = useMutation({
    mutationFn: async () => {
      if (composeTo === 'group') return (await messagesApi.sendToGroup(composeGroupId, composeText)).data.data.sent;
      await messagesApi.sendTeacher(composeStudent!.id, composeText);
      return 1;
    },
    onSuccess: (sent) => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      if (composeTo === 'group') toast.success(`ההודעה נשלחה ל-${sent} תלמידות, לכל אחת בשיחה משלה`);
      setComposeOpen(false);
      resetCompose();
    },
  });

  function resetCompose() {
    setComposeStudent(null);
    setComposeText('');
    setComposeGroupId('');
    setComposeTo('student');
  }

  const canSendCompose = Boolean((composeTo === 'group' ? composeGroupId : composeStudent) && composeText.trim());

  const messages: MessageDTO[] = unwrap(data)?.messages ?? [];
  const openMsg = messages.find((m) => m.id === openId) ?? null;

  function unreadEntries(msg: MessageDTO) {
    return msg.entries.filter((e) => !e.fromTeacher && !e.isRead);
  }
  function isUnread(msg: MessageDTO) {
    return unreadEntries(msg).length > 0;
  }

  // Opening a conversation, from the list or from an email link, marks what it
  // has new as read — and so does a new entry arriving while it is open. Once
  // per newest unread entry, so a refetch before the mark lands doesn't resend it.
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!openMsg) { markedRef.current = null; return; }
    const newest = unreadEntries(openMsg).at(-1);
    if (!newest) return;
    const mark = `${openMsg.id}:${newest.id}`;
    if (markedRef.current === mark) return;
    markedRef.current = mark;
    markReadMutation.mutate(openMsg.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMsg]);

  // A link to a conversation that no longer exists (deleted) just shows the list.
  useEffect(() => {
    if (openId && !isLoading && data && !openMsg) closeConversation();
  }, [openId, isLoading, data, openMsg, closeConversation]);

  useEffect(() => { setReplyText(''); }, [openId]);

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
            const unread = isUnread(msg);
            const last = msg.entries[msg.entries.length - 1];
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
                  {msg.student?.name?.[0] ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('truncate text-sm', unread ? 'font-bold text-ink' : 'font-medium text-ink')}>
                      {msg.student?.name}
                    </span>
                    {unread && <span className="size-2 shrink-0 rounded-full bg-coral" />}
                    {last?.fromTeacher && <Badge variant="secondary" className="shrink-0">שלחת</Badge>}
                    {msg.assignmentId && (
                      <Badge variant="warning" className="shrink-0"><Clock size={9} className="ml-1" /> בקשת הגשה</Badge>
                    )}
                  </div>
                  <p className="truncate text-[13px] text-ink-soft mt-1">{last ? markdownToPlainText(last.content) : null}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 ml-4">
                  <span className="text-[11px] text-ink-soft">{formatDateTime(last?.createdAt ?? msg.createdAt)}</span>
                  {msg.entries.length > 1
                    ? <Badge variant="success">בשיחה</Badge>
                    : <ChevronLeft size={16} className="text-ink-soft" />}
                </div>
              </button>
              <button
                title="מחקי שיחה"
                onClick={async () => {
                  if (await ask({ title: `למחוק את ההודעה מ"${msg.student?.name}"?`, description: 'הפעולה בלתי הפיכה.' })) {
                    deleteMutation.mutate(msg.id);
                  }
                }}
                className="shrink-0 px-3 py-4 text-ink-soft transition-colors hover:bg-coral/10 hover:text-coral flex items-center justify-center"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );})}
        </div>
      )}

      {/* Overlay: full conversation thread, blocking the list behind it */}
      <Dialog open={Boolean(openMsg)} onOpenChange={(o) => { if (!o) closeConversation(); }}>
        <DialogContent size="lg">
          {openMsg && (
            <>
              <DialogHeader>
                <DialogTitle>{openMsg.student?.name}</DialogTitle>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {openMsg.student?.email} · {formatDateTime(openMsg.createdAt)}
                </p>
                {openMsg.assignmentId && (
                  <span className="mt-2 inline-flex"><Badge variant="warning"><Clock size={10} className="ml-1" /> בקשת הגשה מאוחרת</Badge></span>
                )}
              </DialogHeader>

              <DialogBody className="space-y-3 max-h-96 overflow-y-auto">
                {openMsg.entries.map((entry, i) => {
                  const isLastTeacherEntry = entry.fromTeacher && i === openMsg.entries.length - 1;
                  return entry.fromTeacher ? (
                    <div key={entry.id} className="rounded-input border-r-2 border-indigo bg-ground/60 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div className="label mb-0.5">התגובה שלך · {formatDateTime(entry.createdAt)}</div>
                        {isLastTeacherEntry && (
                          <button
                            title="מחקי תגובה"
                            onClick={async () => {
                              if (await ask({ title: 'למחוק את התגובה האחרונה שלך?' })) {
                                deleteReplyMutation.mutate(openMsg.id);
                              }
                            }}
                            className="shrink-0 text-ink-soft transition-colors hover:text-coral"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      <MarkdownRenderer content={entry.content} keepLineBreaks className="break-words text-sm text-ink" />
                    </div>
                  ) : (
                    <div key={entry.id}>
                      <div className="label mb-0.5">התלמידה · {formatDateTime(entry.createdAt)}</div>
                      <MarkdownRenderer content={entry.content} keepLineBreaks className="break-words text-sm leading-relaxed text-ink" />
                    </div>
                  );
                })}
                <div ref={bottomRef} />

                <div className="pt-1">
                  <MarkdownField
                    maxLength={MAX_MESSAGE_LENGTH}
                    label="כתיבת תגובה"
                    rows={4}
                    placeholder="כתבי תגובה לתלמידה…"
                    value={replyText}
                    onChange={setReplyText}
                    onSubmit={() => {
                      if (replyText.trim() && !replyMutation.isPending) replyMutation.mutate({ id: openMsg.id, reply: replyText });
                    }}
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  loading={replyMutation.isPending}
                  disabled={!replyText.trim()}
                  onClick={() => replyMutation.mutate({ id: openMsg.id, reply: replyText })}
                >
                  <Send size={14} /> שלחי
                </Button>
                <Button variant="outline" onClick={closeConversation}>
                  חזרה להודעות
                </Button>
                <Button
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onClick={async () => {
                    if (await ask({ title: `למחוק את ההודעה מ"${openMsg.student?.name}"?`, description: 'הפעולה בלתי הפיכה.' })) {
                      deleteMutation.mutate(openMsg.id);
                    }
                  }}
                >
                  <Trash2 size={14} /> מחקי שיחה
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Compose: teacher starting a new conversation with a student */}
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
                <p className="mt-1 text-xs text-ink-soft">כל תלמידה מקבלת את ההודעה בשיחה משלה, כך שהתשובה שלה מגיעה רק אלייך.</p>
              </div>
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
