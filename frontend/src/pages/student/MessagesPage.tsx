import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { messagesApi } from '@/api/messages.api';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { formatDateTime } from '@/lib/utils';

export default function StudentMessagesPage() {
  const qc = useQueryClient();
  const [content, setContent] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

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
    onError: (e: any) => setError(e.response?.data?.error ?? 'שגיאה בשליחה'),
  });

  const messages: any[] = (data?.data as any)?.data?.messages ?? [];

  return (
    <div className="max-w-lg space-y-4" dir="rtl">
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

      {/* Message history with teacher replies */}
      {messages.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-ink/70">ההודעות שלי</h2>
          {messages.map((msg) => (
            <Card key={msg.id}>
              <CardContent className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink/50">{formatDateTime(msg.createdAt)}</span>
                  {msg.replyContent
                    ? <Badge variant="success">נענתה</Badge>
                    : <Badge variant="warning">ממתינה</Badge>}
                </div>
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.replyContent && (
                  <div className="mt-1 bg-ground/60 border-r border-indigo rounded-input px-3 py-2">
                    <p className="text-xs text-ink/50 mb-0.5">תגובת המורה · {formatDateTime(msg.repliedAt)}</p>
                    <p className="text-sm whitespace-pre-wrap">{msg.replyContent}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
