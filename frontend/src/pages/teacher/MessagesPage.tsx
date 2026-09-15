import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Reply, Mail, ChevronLeft, Clock, Trash2, Plus, Send, X } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
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
import { cn, formatDateTime } from '@/lib/utils';
import { unwrap } from '@/lib/api-utils';
import type { MessageDTO } from '@/types';

export default function TeacherMessagesPage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [openId, setOpenId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeStudent, setComposeStudent] = useState<StudentSearchResult | null>(null);
  const [composeText, setComposeText] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-messages'],
    queryFn: () => messagesApi.getAll(),
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-messages'] }),
  });

  const markReplySeenByTeacherMutation = useMutation({
    mutationFn: (id: string) => messagesApi.markReplySeenByTeacher(id),
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

  const composeMutation = useMutation({
    mutationFn: () => messagesApi.sendTeacher(composeStudent!.id, composeText),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teacher-messages'] });
      setComposeOpen(false);
      setComposeStudent(null);
      setComposeText('');
    },
  });

  const messages: MessageDTO[] = unwrap(data)?.messages ?? [];
  const openMsg = messages.find((m) => m.id === openId) ?? null;

  function openMessage(msg: MessageDTO) {
    setOpenId(msg.id);
    setReplyText(msg.fromTeacher ? '' : (msg.replyContent ?? ''));
    if (!msg.fromTeacher && !msg.isRead) markReadMutation.mutate(msg.id);
    if (msg.fromTeacher && msg.replyContent && !msg.replySeen) markReplySeenByTeacherMutation.mutate(msg.id);
  }

  // Unread from the teacher's perspective: a student's own message not yet read,
  // or (for a teacher-initiated thread) a student reply not yet seen.
  function isUnread(msg: MessageDTO) {
    return msg.fromTeacher ? Boolean(msg.replyContent) && !msg.replySeen : !msg.isRead;
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
    <div className="space-y-5" dir="rtl">
      <PageHeader
        title="הודעות מתלמידות"
        meta="תיבת דואר · נכנס"
        actions={<Button onClick={() => setComposeOpen(true)}><Plus size={14} /> הודעה חדשה</Button>}
      />

      {isLoading ? (
        <div className="p-6 font-sans text-ink-soft">טוען…</div>
      ) : messages.length === 0 ? (
        <EmptyState icon={<Mail size={22} />}>אין הודעות</EmptyState>
      ) : (
        /* External list — sender + one-line preview + status. Full thread opens in an overlay. */
        <div className="sheet divide-y divide-rule overflow-hidden">
          {messages.map((msg) => {
            const unread = isUnread(msg);
            return (
            <div key={msg.id} className="flex w-full items-center transition-colors hover:bg-butter/10">
              <button
                onClick={() => openMessage(msg)}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-right"
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                    unread ? 'bg-clay text-sheet' : 'bg-ground text-ink-soft',
                  )}
                >
                  {msg.student?.name?.[0] ?? '?'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('truncate text-sm', unread ? 'font-bold text-ink' : 'font-medium text-ink')}>
                      {msg.student?.name}
                    </span>
                    {unread && <span className="size-2 shrink-0 rounded-full bg-coral" />}
                    {msg.fromTeacher && <Badge variant="secondary" className="shrink-0">שלחת</Badge>}
                    {msg.assignmentId && (
                      <Badge variant="warning" className="shrink-0"><Clock size={9} className="ml-1" /> בקשת הגשה</Badge>
                    )}
                  </div>
                  <p className="truncate text-[13px] text-ink-soft">{msg.content}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11px] text-ink-soft">{formatDateTime(msg.createdAt)}</span>
                  {msg.replyContent
                    ? <Badge variant="success">{msg.fromTeacher ? 'הגיבה' : 'נענתה'}</Badge>
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
          );})}
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
                  <div className="label mb-1">{openMsg.fromTeacher ? 'ההודעה ששלחת' : 'ההודעה'}</div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{openMsg.content}</p>
                </div>

                {openMsg.replyContent && (
                  <div className="rounded-input border-r-2 border-indigo bg-ground/60 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="label mb-0.5">
                        {openMsg.fromTeacher ? 'התגובה של התלמידה' : 'התגובה שלך'} · {formatDateTime(openMsg.repliedAt)}
                      </div>
                      {!openMsg.fromTeacher && (
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
                      )}
                    </div>
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">{openMsg.replyContent}</p>
                  </div>
                )}

                {!openMsg.fromTeacher && (
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
                )}
              </DialogBody>

              <DialogFooter>
                {!openMsg.fromTeacher && (
                  <Button
                    loading={replyMutation.isPending}
                    disabled={!replyText.trim()}
                    onClick={() => replyMutation.mutate({ id: openMsg.id, reply: replyText })}
                  >
                    <Reply size={14} /> {openMsg.replyContent ? 'עדכני תגובה' : 'שלחי תגובה'}
                  </Button>
                )}
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

      {/* Compose: teacher starting a new conversation with a student */}
      <Dialog open={composeOpen} onOpenChange={(o) => { setComposeOpen(o); if (!o) { setComposeStudent(null); setComposeText(''); } }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>הודעה חדשה לתלמידה</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
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
            <div>
              <div className="label mb-1">תוכן ההודעה</div>
              <Textarea
                rows={5}
                className="resize-y"
                placeholder="כתבי הודעה לתלמידה…"
                value={composeText}
                onChange={(e) => setComposeText(e.target.value)}
              />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              loading={composeMutation.isPending}
              disabled={!composeStudent || !composeText.trim()}
              onClick={() => composeMutation.mutate()}
            >
              <Send size={14} /> שליחה
            </Button>
            <Button variant="outline" onClick={() => setComposeOpen(false)}>ביטול</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
