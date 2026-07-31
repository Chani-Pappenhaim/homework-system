import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Reply, Mail, ChevronLeft, Clock, Trash2 } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn, formatDateTime } from '@/lib/utils';

export default function TeacherMessagesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-messages'],
    queryFn: () => messagesApi.getAll(),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-messages'] }),
  });

  const replyMutation = useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) => messagesApi.reply(id, reply),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      setOpenId(null);
      setReplyText('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => messagesApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      setOpenId(null);
      setReplyText('');
    },
  });

  const deleteReplyMutation = useMutation({
    mutationFn: (id: string) => messagesApi.deleteReply(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      setReplyText('');
    },
  });

  const messages: any[] = (data?.data as any)?.data?.messages ?? [];
  const openMsg = messages.find((m) => m.id === openId) ?? null;

  function openMessage(msg: any) {
    setOpenId(msg.id);
    setReplyText(msg.replyContent ?? '');
    if (!msg.isRead) markReadMutation.mutate(msg.id);
  }

  // The reply-notification email links straight to the relevant message
  // (?highlight=<id>) instead of just the general inbox.
  useEffect(() => {
    const highlight = searchParams.get('highlight');
    if (!highlight || openId) return;
    const msg = messages.find((m) => m.id === highlight);
    if (msg) openMessage(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, messages]);

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader title="הודעות מתלמידות" meta="תיבת דואר · נכנס" />

      {isLoading ? (
        <div className="p-6 font-sans text-ink-soft">טוען…</div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<Mail size={22} />}>אין הודעות</EmptyState>
      ) : (
        /* External list — sender + one-line preview + status. Full thread opens in an overlay. */
        <div className="sheet divide-y divide-rule overflow-hidden">
          {messages.map((msg) => (
            <div key={msg.id} className="flex w-full items-center transition-colors hover:bg-butter/10">
              <button
                onClick={() => openMessage(msg)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-right"
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                    msg.isRead ? 'bg-ground text-ink-soft' : 'bg-clay text-sheet',
                  )}
                >
                  {msg.student?.name?.[0] ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('truncate text-sm', msg.isRead ? 'font-medium text-ink' : 'font-bold text-ink')}>
                      {msg.student?.name}
                    </span>
                    {!msg.isRead && <span className="size-2 shrink-0 rounded-full bg-coral" />}
                    {msg.assignmentId && (
                      <Badge variant="warning" className="shrink-0"><Clock size={9} className="ml-1" /> בקשת הגשה</Badge>
                    )}
                  </div>
                  <p className="truncate text-[13px] text-ink-soft">{msg.content}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-ink-soft">{formatDateTime(msg.createdAt)}</span>
                  {msg.replyContent
                    ? <Badge variant="success">נענתה</Badge>
                    : <ChevronLeft size={16} className="text-ink-soft" />}
                </div>
              </button>
              <button
                title="מחקי שיחה"
                onClick={() => {
                  if (confirm(`למחוק את ההודעה מ"${msg.student?.name}"? הפעולה בלתי הפיכה.`)) {
                    deleteMutation.mutate(msg.id);
                  }
                }}
                className="ml-1 mr-2 shrink-0 rounded-input p-1.5 text-ink-soft transition-colors hover:bg-coral/10 hover:text-coral"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Overlay: full message + reply, blocking the list behind it */}
      <Dialog open={Boolean(openId)} onOpenChange={(o) => { if (!o) { setOpenId(null); setReplyText(''); } }}>
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

              <DialogBody className="space-y-4">
                <div>
                  <div className="label mb-1">ההודעה</div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{openMsg.content}</p>
                </div>

                {openMsg.replyContent && (
                  <div className="rounded-input border-r-2 border-indigo bg-ground/60 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="label mb-0.5">התגובה שלך · {formatDateTime(openMsg.repliedAt)}</div>
                      <button
                        title="מחקי תגובה"
                        onClick={() => {
                          if (confirm('למחוק את התגובה? ההודעה המקורית תישאר, ותוחזר למצב ממתין.')) {
                            deleteReplyMutation.mutate(openMsg.id);
                          }
                        }}
                        className="shrink-0 text-ink-soft transition-colors hover:text-coral"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">{openMsg.replyContent}</p>
                  </div>
                )}

                <div>
                  <div className="label mb-1">{openMsg.replyContent ? 'עריכת התגובה' : 'כתיבת תגובה'}</div>
                  <Textarea
                    rows={5}
                    className="resize-y"
                    placeholder="כתבי תגובה לתלמידה…"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    autoFocus
                  />
                </div>
              </DialogBody>

              <DialogFooter>
                <Button
                  loading={replyMutation.isPending}
                  disabled={!replyText.trim()}
                  onClick={() => replyMutation.mutate({ id: openMsg.id, reply: replyText })}
                >
                  <Reply size={14} /> {openMsg.replyContent ? 'עדכני תגובה' : 'שלחי תגובה'}
                </Button>
                <Button variant="outline" onClick={() => { setOpenId(null); setReplyText(''); }}>
                  סגירה
                </Button>
                <Button
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm(`למחוק את ההודעה מ"${openMsg.student?.name}"? הפעולה בלתי הפיכה.`)) {
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
    </div>
  );
}
