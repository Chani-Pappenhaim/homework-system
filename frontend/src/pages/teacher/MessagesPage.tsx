import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Reply } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/utils';

export default function TeacherMessagesPage() {
  const qc = useQueryClient();
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
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
      setReplyingTo(null);
      setReplyText('');
    },
  });

  const messages: any[] = (data?.data as any)?.data?.messages ?? [];

  if (isLoading) return <div className="p-6 font-sans text-ink/50">טוען…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4" dir="rtl">
      <PageHeader title="הודעות מתלמידות" meta="תיבת דואר · נכנס" />
      {messages.length === 0 && <EmptyState icon={<Reply size={22} />}>אין הודעות</EmptyState>}
      {messages.map((msg, i) => (
        <Card
          key={msg.id}
          accent={!msg.isRead ? 'coral' : 'sage'}
          className={msg.isRead && msg.replyContent ? 'opacity-70' : ''}
          style={{ transform: `rotate(${i % 2 ? 0.3 : -0.3}deg)` }}
        >
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{msg.student.name}</span>
              <div className="flex items-center gap-2">
                {!msg.isRead && <Badge variant="warning">חדש</Badge>}
                {msg.replyContent && <Badge variant="success">נענתה</Badge>}
                <span className="text-xs text-ink/50">{formatDateTime(msg.createdAt)}</span>
              </div>
            </div>
            <p className="text-xs text-ink/50">{msg.student.email}</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{msg.content}</p>

            {/* Existing reply */}
            {msg.replyContent && (
              <div className="mt-2 bg-ground/60 border-r border-indigo rounded-input px-3 py-2">
                <p className="text-xs text-ink/50 mb-0.5">התגובה שלך · {formatDateTime(msg.repliedAt)}</p>
                <p className="text-sm whitespace-pre-wrap">{msg.replyContent}</p>
              </div>
            )}

            {/* Reply form */}
            {replyingTo === msg.id ? (
              <div className="mt-2 space-y-2">
                <Textarea
                  className="resize-none"
                  rows={3}
                  placeholder="כתבי תגובה לתלמידה..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={replyMutation.isPending}
                    disabled={!replyText.trim()}
                    onClick={() => replyMutation.mutate({ id: msg.id, reply: replyText })}
                  >
                    שלחי תגובה
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setReplyingTo(null); setReplyText(''); }}>
                    ביטול
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-3 mt-1">
                <button
                  className="text-xs text-clay underline flex items-center gap-1"
                  onClick={() => { setReplyingTo(msg.id); setReplyText(msg.replyContent ?? ''); }}
                >
                  <Reply size={11} /> {msg.replyContent ? 'ערכי תגובה' : 'הגיבי'}
                </button>
                {!msg.isRead && (
                  <button
                    className="text-xs text-ink/50 underline"
                    onClick={() => markReadMutation.mutate(msg.id)}
                  >
                    סמני כנקראה
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
