import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock, Trash2, Send, MessageSquarePlus } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { MAX_MESSAGE_LENGTH } from '@/lib/limits';
import { Button } from '@/components/ui/button';
import { MarkdownField } from '@/components/ui/markdown-field';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MessageSkeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDateTime, markdownToPlainText } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/errors';
import { unwrap } from '@/lib/api-utils';
import type { MessageDTO } from '@/types';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useMessageDialogs } from '@/hooks/useMessageDialogs';
import { useConfirm } from '@/components/ui/use-confirm';

export default function StudentMessagesPage() {
  usePageTitle('הודעות');
  const qc = useQueryClient();
  const [confirmDialog, ask] = useConfirm();
  const { openId, composeOpen, openConversation, closeConversation, setComposeOpen } = useMessageDialogs();
  const [content, setContent] = useState('');
  // A link from elsewhere on the site ("contact the teacher") starts the message for her.
  const [searchParams] = useSearchParams();
  const draft = searchParams.get('draft');
  useEffect(() => {
    if (composeOpen && draft) setContent((c) => c || draft);
  }, [composeOpen, draft]);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['my-messages'],
    queryFn: () => messagesApi.getMine(),
    refetchInterval: 15_000,
  });

  const mutation = useMutation({
    mutationFn: () => messagesApi.send(content),
    onSuccess: () => {
      setContent(''); setError(''); setComposeOpen(false);
      qc.invalidateQueries({ queryKey: ['my-messages'] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שגיאה בשליחה')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => messagesApi.deleteMine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-messages'] });
      closeConversation();
    },
  });

  const markMineReadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markMineRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['unread-reply-count'] });
      qc.invalidateQueries({ queryKey: ['my-messages'] });
    },
  });

  const studentReplyMutation = useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) => messagesApi.studentReply(id, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-messages'] });
      setReplyText('');
    },
  });

  const messages: MessageDTO[] = unwrap(data)?.messages ?? [];
  const openMsg = messages.find((m) => m.id === openId) ?? null;

  function unreadEntries(msg: MessageDTO) {
    return msg.entries.filter((e) => e.fromTeacher && !e.isRead);
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
    markMineReadMutation.mutate(openMsg.id);
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
        title="הודעה למורה"
        meta="חדר מורה · צ׳אט"
        actions={
          <Button onClick={() => { setContent(''); setError(''); setComposeOpen(true); }}>
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
              const unread = isUnread(msg);
              const last = msg.entries[msg.entries.length - 1];
              return (
              <button
                key={msg.id}
                onClick={() => openConversation(msg.id)}
                className="flex w-full items-stretch gap-3 px-4 py-3 text-right transition-colors hover:bg-butter/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={cn('truncate text-sm', unread ? 'font-bold text-ink' : 'font-medium text-ink')}>{last ? markdownToPlainText(last.content) : null}</p>
                    {last?.fromTeacher && <Badge variant="secondary" className="shrink-0">מהמורה</Badge>}
                    {msg.assignmentId && (
                      <Badge variant="warning" className="shrink-0"><Clock size={9} className="ml-1" /> בקשת הגשה</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-soft mt-1">{formatDateTime(last?.createdAt ?? msg.createdAt)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2 ml-4">
                  {unread && (
                    <span className="size-2 shrink-0 rounded-full bg-coral" />
                  )}
                  {msg.entries.length > 1 && <Badge variant="success">בשיחה</Badge>}
                  <ChevronLeft size={16} className="shrink-0 text-ink-soft" />
                </div>
              </button>
            );})}
          </div>
        </div>
      )}

      {/* Compose — floating dialog, like the teacher's "הודעה חדשה" flow */}
      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) { setContent(''); setError(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>הודעה חדשה למורה</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
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
                <DialogTitle>השיחה שלי עם המורה</DialogTitle>
                <p className="mt-0.5 text-xs text-ink-soft">{formatDateTime(openMsg.createdAt)}</p>
                {openMsg.assignmentId && (
                  <span className="mt-2 inline-flex"><Badge variant="warning"><Clock size={10} className="ml-1" /> בקשת הגשה מאוחרת</Badge></span>
                )}
              </DialogHeader>

              <DialogBody className="space-y-3 max-h-96 overflow-y-auto">
                {openMsg.entries.map((entry) => (
                  entry.fromTeacher ? (
                    <div key={entry.id} className="rounded-input border-r-2 border-indigo bg-ground/60 px-3 py-2">
                      <div className="label mb-0.5">תגובת המורה · {formatDateTime(entry.createdAt)}</div>
                      <MarkdownRenderer content={entry.content} keepLineBreaks className="break-words text-sm text-ink" />
                    </div>
                  ) : (
                    <div key={entry.id}>
                      <div className="label mb-0.5">ההודעה שלי · {formatDateTime(entry.createdAt)}</div>
                      <MarkdownRenderer content={entry.content} keepLineBreaks className="break-words text-sm leading-relaxed text-ink" />
                    </div>
                  )
                ))}
                <div ref={bottomRef} />

                <div className="pt-1">
                  <MarkdownField
                    maxLength={MAX_MESSAGE_LENGTH}
                    label="כתיבת תגובה"
                    rows={4}
                    placeholder="כתבי תגובה למורה…"
                    value={replyText}
                    onChange={setReplyText}
                    onSubmit={() => {
                      if (replyText.trim() && !studentReplyMutation.isPending) studentReplyMutation.mutate({ id: openMsg.id, reply: replyText });
                    }}
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  loading={studentReplyMutation.isPending}
                  disabled={!replyText.trim()}
                  onClick={() => studentReplyMutation.mutate({ id: openMsg.id, reply: replyText })}
                >
                  <Send size={14} /> שלחי
                </Button>
                <Button variant="outline" onClick={closeConversation}>
                  סגירה
                </Button>
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
