import { useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Camera, Trash2 } from 'lucide-react';
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { AVATAR_TYPES, avatarFileProblem } from '@/lib/avatar';
import { getApiErrorMessage } from '@/lib/errors';

/** The signed-in user's profile picture, with buttons to replace or remove it. */
export function AvatarEditor() {
  const { user, accessToken, setAuth } = useAuthStore();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);

  // The reply carries the user with her new picture link; the store feeds every Avatar on screen.
  const onSaved = (message: string) => (res: Awaited<ReturnType<typeof authApi.updateAvatar>>) => {
    if (accessToken) setAuth(res.data.data.user, accessToken);
    toast.success(message);
  };

  const upload = useMutation({
    mutationFn: (file: File) => authApi.updateAvatar(file),
    onSuccess: onSaved('התמונה נשמרה'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה בשמירת התמונה')),
  });

  const remove = useMutation({
    mutationFn: () => authApi.removeAvatar(),
    onSuccess: onSaved('התמונה הוסרה'),
    onError: (err) => toast.error(getApiErrorMessage(err, 'שגיאה בהסרת התמונה')),
  });

  if (!user) return null;

  function pick(file: File | undefined) {
    if (!file) return;
    const problem = avatarFileProblem(file);
    if (problem) toast.error(problem);
    else upload.mutate(file);
  }

  const busy = upload.isPending || remove.isPending;

  return (
    <div className="flex items-center gap-4">
      <Avatar name={user.name} src={user.avatarUrl} size="xl" />
      <div className="flex flex-col items-start gap-2">
        <input
          ref={fileInput}
          type="file"
          accept={AVATAR_TYPES.join(',')}
          className="hidden"
          aria-label="בחירת תמונת פרופיל"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }}
        />
        <Button type="button" variant="secondary" size="sm" loading={upload.isPending} disabled={busy} onClick={() => fileInput.current?.click()}>
          <Camera size={14} /> {user.avatarUrl ? 'החלפת תמונה' : 'העלאת תמונה'}
        </Button>
        {user.avatarUrl && (
          <Button type="button" variant="ghost" size="sm" loading={remove.isPending} disabled={busy} onClick={() => remove.mutate()}>
            <Trash2 size={14} /> הסרת התמונה
          </Button>
        )}
        <p className="text-xs text-ink-soft">JPG, PNG או WEBP, עד 2MB</p>
      </div>
    </div>
  );
}
