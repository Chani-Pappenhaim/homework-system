import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Reply, Mail, ChevronLeft, Clock } from 'lucide-react';
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

  const messages: any[] = (data?.data as any)?.data?.messages ?? [];
  const openMsg = messages.find((m) => m.id === openId) ?? null;

  function openMessage(msg: any) {
    setOpenId(msg.id);
    setReplyText(msg.replyContent ?? '');
    if (!msg.isRead) markReadMutation.mutate(msg.id);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4" dir="rtl">
      <PageHeader title="הודעות מתלמידות" meta="תיבת דואר · נכנס" />

      {isLoading ? (
        <div className="p-6 font-sans text-ink-soft">טוען…</div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<Mail size={22} />}>אין הודעות</EmptyState>
      ) : (
        /* External list — sender + one-line preview + status. Full thread opens in an overlay. */
        <div className="sheet divide-y divide-rule overflow-hidden">
          {messages.map((msg) => (
            <button
              key={msg.id}
              onClick={() => openMessage(msg)}
              className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-butter/10"
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
                    <div className="label mb-0.5">התגובה שלך · {formatDateTime(openMsg.repliedAt)}</div>
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
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
