import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Clock, Trash2, Reply } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
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
import type { MessageDTO } from '@/types';

export default function StudentMessagesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [content, setContent] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data } = useQuery({
    queryKey: ['my-messages'],
    queryFn: () => messagesApi.getMine(),
  });

  const mutation = useMutation({
    mutationFn: () => messagesApi.send(content),
    onSuccess: () => {
      setSent(true); setContent(''); setError('');
      qc.invalidateQueries({ queryKey: ['my-messages'] });
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שגיאה בשליחה')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => messagesApi.deleteMine(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-messages'] });
      setOpenId(null);
    },
  });

  const markReplySeenMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markReplySeen(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['unread-reply-count'] }),
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
      setOpenId(null);
      setReplyText('');
    },
  });

  const messages: MessageDTO[] = unwrap(data)?.messages ?? [];
  const openMsg = messages.find((m) => m.id === openId) ?? null;

  function openMessage(msg: MessageDTO) {
    setOpenId(msg.id);
    setReplyText('');
    if (msg.fromTeacher) {
      if (!msg.isRead) markMineReadMutation.mutate(msg.id);
    } else if (msg.replyContent && !msg.replySeen) {
      markReplySeenMutation.mutate(msg.id);
    }
  }

  function isUnread(msg: MessageDTO) {
    return msg.fromTeacher ? !msg.isRead : Boolean(msg.replyContent) && !msg.replySeen;
  }

  // The teacher-reply / teacher-message notification email links straight to this message.
  useEffect(() => {
    const highlight = searchParams.get('highlight');
    if (!highlight || openId) return;
    const msg = messages.find((m) => m.id === highlight);
    if (msg) openMessage(msg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, messages]);

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader title="הודעה למורה" meta="חדר מורה · צ׳אט" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start">
      <Card accent="indigo">
        <CardHeader><h2 className="font-display text-base font-bold">שלחי הודעה</h2></CardHeader>
        <CardContent className="space-y-3">
          {sent && (
            <div className="border border-sage bg-sage/15 p-3 text-sm font-bold text-sage">
              ההודעה נשלחה בהצלחה ✓
            </div>
          )}
          <Textarea
            className="resize-none"
            rows={5}
            placeholder="כתבי את ההודעה שלך..."
            value={content}
            onChange={(e) => { setContent(e.target.value); setSent(false); }}
          />
          {error && <p className="text-coral text-xs">{error}</p>}
          <Button loading={mutation.isPending} onClick={() => mutation.mutate()} disabled={!content.trim()}>
            שלחי
          </Button>
        </CardContent>
      </Card>

      {/* Message history — list opens the full thread in a floating overlay, like the teacher's inbox */}
      {messages.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-ink/70">ההודעות שלי</h2>
          <div className="sheet divide-y divide-rule overflow-hidden">
            {messages.map((msg) => {
              const unread = isUnread(msg);
              return (
              <button
                key={msg.id}
                onClick={() => openMessage(msg)}
                className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-butter/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn('truncate text-sm', unread ? 'font-bold text-ink' : 'font-medium text-ink')}>{msg.content}</p>
                    {msg.fromTeacher && <Badge variant="secondary" className="shrink-0">מהמורה</Badge>}
                    {msg.assignmentId && (
                      <Badge variant="warning" className="shrink-0"><Clock size={9} className="ml-1" /> בקשת הגשה</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-ink-soft">{formatDateTime(msg.createdAt)}</p>
                </div>
                {unread && (
                  <span className="size-2 shrink-0 rounded-full bg-coral" />
                )}
                {msg.replyContent
                  ? <Badge variant="success">נענתה</Badge>
                  : <Badge variant="warning">ממתינה</Badge>}
                <ChevronLeft size={16} className="shrink-0 text-ink-soft" />
              </button>
            );})}
          </div>
        </div>
      )}
      </div>

      {/* Overlay: full message + reply, floating above everything — mirrors the teacher's message overlay */}
      <Dialog open={Boolean(openId)} onOpenChange={(o) => { if (!o) { setOpenId(null); setReplyText(''); } }}>
        <DialogContent size="lg">
          {openMsg && (
            <>
              <DialogHeader>
                <DialogTitle>{openMsg.fromTeacher ? 'הודעה מהמורה' : 'ההודעה שלי'}</DialogTitle>
                <p className="mt-0.5 text-xs text-ink-soft">{formatDateTime(openMsg.createdAt)}</p>
                {openMsg.assignmentId && (
                  <span className="mt-2 inline-flex"><Badge variant="warning"><Clock size={10} className="ml-1" /> בקשת הגשה מאוחרת</Badge></span>
                )}
              </DialogHeader>

              <DialogBody className="space-y-4">
                <div>
                  <div className="label mb-1">{openMsg.fromTeacher ? 'ההודעה' : 'ההודעה שלי'}</div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{openMsg.content}</p>
                </div>

                {openMsg.replyContent ? (
                  <div className="rounded-input border-r-2 border-indigo bg-ground/60 px-3 py-2">
                    <div className="label mb-0.5">
                      {openMsg.fromTeacher ? 'התגובה שלי' : 'תגובת המורה'} · {formatDateTime(openMsg.repliedAt)}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">{openMsg.replyContent}</p>
                  </div>
                ) : openMsg.fromTeacher ? (
                  <div>
                    <div className="label mb-1">כתיבת תגובה</div>
                    <Textarea
                      rows={5}
                      className="resize-y"
                      placeholder="כתבי תגובה למורה…"
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className={cn('rounded-input border border-dashed border-rule px-3 py-2 text-xs text-ink-soft')}>
                    המורה עוד לא הגיבה להודעה זו
                  </div>
                )}
              </DialogBody>

              <DialogFooter>
                {openMsg.fromTeacher && !openMsg.replyContent && (
                  <Button
                    loading={studentReplyMutation.isPending}
                    disabled={!replyText.trim()}
                    onClick={() => studentReplyMutation.mutate({ id: openMsg.id, reply: replyText })}
                  >
                    <Reply size={14} /> שלחי תגובה
                  </Button>
                )}
                <Button variant="outline" onClick={() => { setOpenId(null); setReplyText(''); }}>
                  סגירה
                </Button>
                <Button
                  variant="destructive"
                  loading={deleteMutation.isPending}
                  onClick={() => {
                    if (confirm('למחוק את ההודעה? הפעולה בלתי הפיכה.')) {
                      deleteMutation.mutate(openMsg.id);
                    }
                  }}
                >
                  <Trash2 size={14} /> מחקי הודעה
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
