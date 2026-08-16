import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { messagesApi } from '@/api/messages.api';
import { getApiErrorMessage } from '@/lib/errors';

/** A student's one-line request to the teacher (late submission, extra AI review, ...), sent as a message. */
export function useTeacherRequest(buildMessage: (reason: string) => string, assignmentId: string) {
  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => messagesApi.send(buildMessage(reason.trim()), assignmentId),
    onSuccess: () => {
      setSent(true);
      setFormOpen(false);
      setReason('');
      setError('');
    },
    onError: (e: any) => setError(getApiErrorMessage(e, 'שגיאה בשליחת הבקשה')),
  });

  return {
    formOpen, setFormOpen,
    reason, setReason,
    sent,
    error,
    sending: mutation.isPending,
    send: () => mutation.mutate(),
  };
}
