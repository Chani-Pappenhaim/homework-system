import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock, Trash2, Send, MessageSquarePlus, MailX, Users } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { MAX_MESSAGE_LENGTH } from '@/lib/limits';
import { Button } from '@/components/ui/button';
import { MarkdownField } from '@/components/ui/markdown-field';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSkeleton } from '@/components/ui/skeleton';
import { EntryCard } from '@/components/messages/EntryCard';
import { SubjectField } from '@/components/messages/SubjectField';
import { ThreadTitleLine } from '@/components/messages/ThreadTitleLine';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDateTime } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/errors';
import { unwrap } from '@/lib/api-utils';
import type { MessageDetailDTO, MessageDTO } from '@/types';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMessageDialogs } from '@/hooks/useMessageDialogs';
import { threadQueryKey, useOpenThread, useToggleReaction } from '@/hooks/useOpenThread';
import { useConfirm } from '@/components/ui/use-confirm';

/** Whether a list row has anything from someone else that could be marked unread. */
function hasIncoming(msg: MessageDTO) {
  return msg.replyCount > 0 || (msg.lastEntry !== null && !msg.lastEntry.mine);
}

/** The heading of an open thread: who it is with, as the student should read it. */
function threadHeading(thread: MessageDetailDTO) {
  if (thread.audience === 'DIRECT') return 'השיחה שלי עם המורה';
  return thread.groupName ? `הודעה לקבוצה ${thread.groupName}` : 'הודעה לקבוצה';
}

export default function StudentMessagesPage() {
  usePageTitle('הודעות');
  const qc = useQueryClient();
  const [confirmDialog, ask] = useConfirm();
  const { openId, composeOpen, openConversation, closeConversation, setComposeOpen } = useMessageDialogs();
  const [content, setContent] = useState('');
  const [subject, setSubject] = useState('');
  // A link from elsewhere on the site ("contact the teacher") starts the message for her.
  const [searchParams] = useSearchParams();
  const draft = searchParams.get('draft');
  useEffect(() => {
    if (composeOpen && draft) setContent((c) => c || draft);
  }, [composeOpen, draft]);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  // In a visible group thread a reply goes to everyone or only to the teacher.
  const [replyScope, setReplyScope] = useState<'ALL' | 'TEACHER'>('ALL');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['my-messages'],
    queryFn: () => messagesApi.getMine(),
    refetchInterval: 15_000,
  });

  const mutation = useMutation({
    mutationFn: () => messagesApi.send(content, undefined, subject.trim() || undefined),
    onSuccess: () => {
      setContent(''); setSubject(''); setError(''); setComposeOpen(false);
      qc.invalidateQueries({ queryKey: ['my-messages'] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שגיאה בשליחה')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => messagesApi.deleteMine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-messages'] });
      qc.invalidateQueries({ queryKey: ['unread-reply-count'] });
      closeConversation();
    },
  });

  // The unread badge counts entries on its own, so it refreshes with the list.
  function refreshAfterReadChange(id: string) {
    qc.invalidateQueries({ queryKey: ['unread-reply-count'] });
    qc.invalidateQueries({ queryKey: ['my-messages'] });
    qc.invalidateQueries({ queryKey: threadQueryKey(id) });
  }

  const markMineReadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markMineRead(id),
    onSuccess: (_r, id) => refreshAfterReadChange(id),
  });

  const markMineUnreadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markMineUnread(id),
    onSuccess: (_r, id) => refreshAfterReadChange(id),
  });

  const studentReplyMutation = useMutation({
    mutationFn: ({ id, reply, scope }: { id: string; reply: string; scope: 'ALL' | 'TEACHER' }) =>
      messagesApi.studentReply(id, reply, scope === 'TEACHER' ? { scope: 'TEACHER' as const } : {}),
    onSuccess: (_r, { id }) => {
      qc.invalidateQueries({ queryKey: ['my-messages'] });
      qc.invalidateQueries({ queryKey: threadQueryKey(id) });
      setReplyText('');
    },
  });

  const { thread: openMsg, notFound } = useOpenThread(openId, (id) => markMineReadMutation.mutate(id));
  const toggleReaction = useToggleReaction(openId);

  const messages: MessageDTO[] = unwrap(data)?.messages ?? [];

  // A link to a conversation that no longer exists (deleted) just shows the list.
  useEffect(() => {
    if (openId && notFound) closeConversation();
  }, [openId, notFound, closeConversation]);

  useEffect(() => { setReplyText(''); setReplyScope('ALL'); }, [openId]);

  useEffect(() => {
    if (openId) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [openId, openMsg?.entries.length]);

  const isVisibleGroup = openMsg?.audience === 'GROUP_VISIBLE';

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="הודעה למורה"
        meta="חדר מורה · צ׳אט"
        actions={
          <Button onClick={() => { setContent(''); setSubject(''); setError(''); setComposeOpen(true); }}>
            <MessageSquarePlus size={15} /> הודעה חדשה
          </Button>
        }
      />

      {isLoading ? (
        <div className="sheet divide-y divide-rule overflow-hidden">
          {[...Array(4)].map((_, i) => <MessageSkeleton key={i} />)}
        </div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<MessageSquarePlus size={22} />}>אין הודעות עדיין</EmptyState>
      ) : (
        <div className="space-y-2">
          <div className="sheet divide-y divide-rule overflow-hidden">
            {messages.map((msg) => {
              const unread = msg.unread;
              const isGroup = msg.audience !== 'DIRECT';
              return (
              <div key={msg.id} className="flex w-full items-stretch transition-colors hover:bg-butter/10">
                <button
                  onClick={() => openConversation(msg.id)}
                  className="flex min-w-0 flex-1 items-stretch gap-3 px-4 py-3 text-right"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {unread && <span aria-label="לא נקרא" className="size-2 shrink-0 rounded-full bg-coral" />}
                      {isGroup && (
                        <Badge variant="muted" className="shrink-0">
                          <Users size={9} className="ml-1" /> {msg.groupName ?? 'קבוצה'}
                        </Badge>
                      )}
                      {msg.lastEntry?.fromTeacher && <Badge variant="secondary" className="shrink-0">מהמורה</Badge>}
                      {msg.assignmentId && (
                        <Badge variant="warning" className="shrink-0"><Clock size={9} className="ml-1" /> בקשת הגשה</Badge>
                      )}
                    </div>
                    <ThreadTitleLine msg={msg} />
                    <p className={cn('mt-1 text-[11px] text-ink-soft')}>{formatDateTime(msg.lastEntry?.createdAt ?? msg.createdAt)}</p>
                  </div>
                  <ChevronLeft size={16} className="shrink-0 self-center text-ink-soft ml-4" />
                </button>
                {!unread && hasIncoming(msg) && (
                  <button
                    title="סמני כלא נקרא"
                    aria-label="סמני כלא נקרא"
                    onClick={() => markMineUnreadMutation.mutate(msg.id)}
                    className="shrink-0 px-3 py-4 text-ink-soft transition-colors hover:bg-butter/20 hover:text-ink flex items-center justify-center"
                  >
                    <MailX size={16} />
                  </button>
                )}
              </div>
            );})}
          </div>
        </div>
      )}

      {/* Compose — floating dialog, like the teacher's "הודעה חדשה" flow */}
      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) { setContent(''); setSubject(''); setError(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הודעה חדשה למורה</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <SubjectField value={subject} onChange={setSubject} />
            <MarkdownField
                    maxLength={MAX_MESSAGE_LENGTH}
              label="תוכן ההודעה"
              rows={5}
              placeholder="כתבי את ההודעה שלך..."
              value={content}
              onChange={setContent}
              onSubmit={() => { if (content.trim() && !mutation.isPending) mutation.mutate(); }}
            />
            {error && <p className="text-coral text-xs">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate()} disabled={!content.trim()}>
              שלחי
            </Button>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>
              ביטול
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overlay: full conversation thread — mirrors the teacher's message overlay */}
      <Dialog open={Boolean(openMsg)} onOpenChange={(o) => { if (!o) closeConversation(); }}>
        <DialogContent size="lg">
          {openMsg && (
            <>
              <DialogHeader>
                <DialogTitle>{openMsg.subject ?? threadHeading(openMsg)}</DialogTitle>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {openMsg.subject && openMsg.audience !== 'DIRECT' ? `${threadHeading(openMsg)} · ` : ''}
                  {formatDateTime(openMsg.createdAt)}
                </p>
                {openMsg.audience === 'GROUP_BCC' && (
                  <p className="mt-1 text-xs text-ink-soft">
                    נשלח לכל הקבוצה. תגובה שלך תגיע רק למורה.
                  </p>
                )}
                {isVisibleGroup && openMsg.participants && (
                  <details className="mt-1 text-xs text-ink-soft">
                    <summary className="cursor-pointer">נשלח ל-{openMsg.participants.length} תלמידות</summary>
                    <p className="mt-1">{openMsg.participants.map((p) => p.name).join(', ')}</p>
                  </details>
                )}
                {openMsg.assignmentId && (
                  <span className="mt-2 inline-flex"><Badge variant="warning"><Clock size={10} className="ml-1" /> בקשת הגשה מאוחרת</Badge></span>
                )}
              </DialogHeader>

              <DialogBody className="space-y-3 max-h-96 overflow-y-auto">
                {openMsg.entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    label={entry.fromTeacher ? 'תגובת המורה' : entry.mine ? 'ההודעה שלי' : entry.authorName ?? 'תלמידה'}
                    privateNote={entry.mine ? 'רק למורה' : entry.fromTeacher ? 'רק אלייך' : undefined}
                    onReact={(emoji) => toggleReaction.mutate({ entryId: entry.id, emoji })}
                  />
                ))}
                <div ref={bottomRef} />

                <div className="space-y-2 pt-1">
                  {isVisibleGroup && (
                    <div className="inline-flex rounded-lg border border-rule bg-sheet p-0.5" role="radiogroup" aria-label="למי התגובה">
                      {([['ALL', 'לכולן'], ['TEACHER', 'רק למורה']] as const).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          role="radio"
                          aria-checked={replyScope === key}
                          onClick={() => setReplyScope(key)}
                          className={cn('rounded-md px-3 py-1 text-xs font-semibold', replyScope === key ? 'bg-ink text-sheet' : 'text-ink/60 hover:text-ink')}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  <MarkdownField
                    maxLength={MAX_MESSAGE_LENGTH}
                    label="כתיבת תגובה"
                    rows={4}
                    placeholder={openMsg.audience === 'DIRECT' || replyScope === 'TEACHER' || openMsg.audience === 'GROUP_BCC' ? 'כתבי תגובה למורה…' : 'כתבי תגובה…'}
                    value={replyText}
                    onChange={setReplyText}
                    onSubmit={() => {
                      if (replyText.trim() && !studentReplyMutation.isPending) {
                        studentReplyMutation.mutate({ id: openMsg.id, reply: replyText, scope: replyScope });
                      }
                    }}
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  loading={studentReplyMutation.isPending}
                  disabled={!replyText.trim()}
                  onClick={() => studentReplyMutation.mutate({ id: openMsg.id, reply: replyText, scope: replyScope })}
                >
                  <Send size={14} /> שלחי
                </Button>
                <Button variant="outline" onClick={closeConversation}>
                  חזרה להודעות
                </Button>
                {openMsg.entries.some((e) => !e.mine) && (
                  <Button
                    variant="outline"
                    loading={markMineUnreadMutation.isPending}
                    // Closing keeps the thread from being marked read again straight away.
                    onClick={() => markMineUnreadMutation.mutate(openMsg.id, { onSuccess: closeConversation })}
                  >
                    <MailX size={14} /> סמני כלא נקרא
                  </Button>
                )}
                <Button
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onClick={async () => {
                    if (await ask({ title: 'למחוק את השיחה?', description: 'הפעולה בלתי הפיכה.' })) {
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
      {confirmDialog}
    </div>
  );
}
