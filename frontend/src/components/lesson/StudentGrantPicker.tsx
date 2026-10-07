import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { studentsApi } from '@/api/students.api';
import { StudentAutocomplete } from '@/components/ui/student-autocomplete';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { getApiErrorMessage } from '@/lib/errors';

/**
 * Picks an existing student to grant access to — or, when the search finds
 * no one, offers to create her right there (a student with no group, e.g. for
 * private lessons) and grants access to the new account.
 */
export function StudentGrantPicker({ onGrant, initialEmail }: {
  onGrant: (studentId: string) => void;
  /** Opens the new-student form straight away with this email (e.g. an address a bulk grant didn't find). */
  initialEmail?: string;
}) {
  const toast = useToast();
  const [creating, setCreating] = useState(Boolean(initialEmail));
  const [name, setName] = useState('');
  const [email, setEmail] = useState(initialEmail ?? '');
  const [github, setGithub] = useState('');

  const startCreate = (query: string) => {
    const q = query.trim();
    if (q.includes('@')) { setEmail(q); setName(''); } else { setName(q); setEmail(''); }
    setGithub('');
    setCreating(true);
  };

  const createMutation = useMutation({
    mutationFn: () => studentsApi.create({ name: name.trim(), email: email.trim(), githubUsername: github.trim() || undefined }),
    onSuccess: (res) => {
      const student = res.data.data.student;
      toast.success(`נוצר חשבון ל${student.name} — סיסמה ראשונית 12345678 (תתבקש להחליף בכניסה הראשונה)`);
      setCreating(false);
      onGrant(student.id);
    },
    onError: (err) => toast.error(getApiErrorMessage(err, 'יצירת התלמידה נכשלה')),
  });

  if (!creating) {
    return <StudentAutocomplete onSelect={(s) => onGrant(s.id)} onNoMatch={startCreate} />;
  }

  return (
    <form
      className="space-y-2 rounded-input border border-rule bg-ground/40 p-3"
      onSubmit={(e) => { e.preventDefault(); createMutation.mutate(); }}
    >
      <p className="text-xs font-semibold text-ink/70">תלמידה חדשה (ללא קבוצה)</p>
      <Input label="שם מלא" value={name} onChange={(e) => setName(e.target.value)} required />
      <Input label="אימייל" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <Input label="שם משתמש GitHub (אופציונלי)" dir="ltr" value={github} onChange={(e) => setGithub(e.target.value)} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={createMutation.isPending} disabled={!name.trim() || !email.trim()}>
          <UserPlus size={13} /> יצירה ומתן גישה
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setCreating(false)}>ביטול</Button>
      </div>
    </form>
  );
}
