import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Reply } from 'lucide-react';
import { messagesApi } from '@/api/messages.api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

  if (isLoading) return <div className="p-6 text-[#9CA3AF]">טוען...</div>;

  return (
    <div className="max-w-2xl space-y-4" dir="rtl">
      <h1 className="text-xl font-bold">הודעות מתלמידות</h1>
      {messages.length === 0 && <p className="text-[#9CA3AF] text-sm">אין הודעות</p>}
      {messages.map((msg) => (
        <Card key={msg.id} className={msg.isRead && msg.replyContent ? 'opacity-70' : ''}>
          <CardContent className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">{msg.student.name}</span>
              <div className="flex items-center gap-2">
                {!msg.isRead && <Badge variant="warning">חדש</Badge>}
                {msg.replyContent && <Badge variant="success">נענתה</Badge>}
                <span className="text-xs text-[#9CA3AF]">{formatDateTime(msg.createdAt)}</span>
              </div>
            </div>
            <p className="text-xs text-[#9CA3AF]">{msg.student.email}</p>
            <p className="text-sm mt-1 whitespace-pre-wrap">{msg.content}</p>

            {/* Existing reply */}
            {msg.replyContent && (
              <div className="mt-2 bg-[#F8F7FC] border-r-2 border-[#7C3AED] rounded-input px-3 py-2">
                <p className="text-xs text-[#9CA3AF] mb-0.5">התגובה שלך · {formatDateTime(msg.repliedAt)}</p>
                <p className="text-sm whitespace-pre-wrap">{msg.replyContent}</p>
              </div>
            )}

            {/* Reply form */}
            {replyingTo === msg.id ? (
              <div className="mt-2 space-y-2">
                <textarea
                  className="w-full border border-[#EEEBF5] rounded-input px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
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
                  className="text-xs text-primary underline flex items-center gap-1"
                  onClick={() => { setReplyingTo(msg.id); setReplyText(msg.replyContent ?? ''); }}
                >
                  <Reply size={11} /> {msg.replyContent ? 'ערכי תגובה' : 'הגיבי'}
                </button>
                {!msg.isRead && (
                  <button
                    className="text-xs text-[#9CA3AF] underline"
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
