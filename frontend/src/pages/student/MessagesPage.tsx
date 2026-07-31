import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Trash2 } from 'lucide-react';
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

export default function StudentMessagesPage() {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

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

  const messages: any[] = (data?.data as any)?.data?.messages ?? [];
  const openMsg = messages.find((m) => m.id === openId) ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4" dir="rtl">
      <PageHeader title="הודעה למורה" meta="חדר מורה · צ׳אט" />
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
            {messages.map((msg) => (
              <button
                key={msg.id}
                onClick={() => setOpenId(msg.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-right transition-colors hover:bg-butter/10"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{msg.content}</p>
                  <p className="text-[11px] text-ink-soft">{formatDateTime(msg.createdAt)}</p>
                </div>
                {msg.replyContent
                  ? <Badge variant="success">נענתה</Badge>
                  : <Badge variant="warning">ממתינה</Badge>}
                <ChevronLeft size={16} className="shrink-0 text-ink-soft" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Overlay: full message + teacher's reply, floating above everything — mirrors the teacher's message overlay */}
      <Dialog open={Boolean(openId)} onOpenChange={(o) => { if (!o) setOpenId(null); }}>
        <DialogContent size="lg">
          {openMsg && (
            <>
              <DialogHeader>
                <DialogTitle>ההודעה שלי</DialogTitle>
                <p className="mt-0.5 text-xs text-ink-soft">{formatDateTime(openMsg.createdAt)}</p>
              </DialogHeader>

              <DialogBody className="space-y-4">
                <div>
                  <div className="label mb-1">ההודעה</div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{openMsg.content}</p>
                </div>

                {openMsg.replyContent ? (
                  <div className="rounded-input border-r-2 border-indigo bg-ground/60 px-3 py-2">
                    <div className="label mb-0.5">תגובת המורה · {formatDateTime(openMsg.repliedAt)}</div>
                    <p className="whitespace-pre-wrap break-words text-sm text-ink">{openMsg.replyContent}</p>
                  </div>
                ) : (
                  <div className={cn('rounded-input border border-dashed border-rule px-3 py-2 text-xs text-ink-soft')}>
                    המורה עוד לא הגיבה להודעה זו
                  </div>
                )}
              </DialogBody>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpenId(null)}>
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
