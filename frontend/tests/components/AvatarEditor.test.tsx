import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AvatarEditor } from '@/components/profile/AvatarEditor';
import { ToastProvider } from '@/components/ui/toast';
import { avatarFileProblem } from '@/lib/avatar';
import useAuthStore from '@/store/authStore';
import { renderWithProviders, setAuthUser } from '../utils/render';

vi.mock('@/api/auth.api', () => ({
  authApi: { updateAvatar: vi.fn(), removeAvatar: vi.fn() },
}));
import { authApi } from '@/api/auth.api';
const updateAvatar = authApi.updateAvatar as unknown as ReturnType<typeof vi.fn>;
const removeAvatar = authApi.removeAvatar as unknown as ReturnType<typeof vi.fn>;

const reply = (avatarUrl: string | null) => ({ data: { success: true, data: { user: { id: 'u1', name: 'דינה כהן', avatarUrl } } } });
const png = (size = 10) => new File([new Uint8Array(size)], 'me.png', { type: 'image/png' });
const picker = () => screen.getByLabelText('בחירת תמונת פרופיל');

function renderEditor() {
  return renderWithProviders(<ToastProvider><AvatarEditor /></ToastProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser({ name: 'דינה כהן', avatarUrl: null });
});

describe('AvatarEditor', () => {
  it('shows her initials and only an upload button while she has no picture', () => {
    renderEditor();
    expect(screen.getByRole('img', { name: 'דינה כהן' })).toHaveTextContent('דכ');
    expect(screen.getByRole('button', { name: /העלאת תמונה/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /הסרת התמונה/ })).not.toBeInTheDocument();
  });

  it('uploads the chosen file and shows the new picture at once', async () => {
    updateAvatar.mockResolvedValue(reply('/files/download/u1/file.png?token=t'));
    const user = userEvent.setup();
    renderEditor();
    const file = png();
    await user.upload(picker(), file);
    await waitFor(() => expect(updateAvatar).toHaveBeenCalledWith(file));
    expect(await screen.findByText('התמונה נשמרה')).toBeInTheDocument();
    expect(useAuthStore.getState().user?.avatarUrl).toBe('/files/download/u1/file.png?token=t');
    expect(screen.getByRole('img', { name: 'דינה כהן' }).tagName).toBe('IMG');
    expect(screen.getByRole('button', { name: /החלפת תמונה/ })).toBeInTheDocument();
  });

  it('refuses a file of the wrong type without sending it', async () => {
    const user = userEvent.setup({ applyAccept: false });
    renderEditor();
    await user.upload(picker(), new File(['x'], 'a.gif', { type: 'image/gif' }));
    const problem = avatarFileProblem(new File(['x'], 'a.gif', { type: 'image/gif' }))!;
    expect(await screen.findByText(problem)).toBeInTheDocument();
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it('refuses a file over 2MB without sending it', async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.upload(picker(), png(2 * 1024 * 1024 + 1));
    expect(await screen.findByText('התמונה גדולה מדי (עד 2MB)')).toBeInTheDocument();
    expect(updateAvatar).not.toHaveBeenCalled();
  });

  it("shows the server's reason when the upload fails", async () => {
    updateAvatar.mockRejectedValue({ isAxiosError: true, response: { data: { error: 'יש להעלות תמונה מסוג JPG, PNG או WEBP' } } });
    const user = userEvent.setup();
    renderEditor();
    await user.upload(picker(), png());
    expect(await screen.findAllByText('יש להעלות תמונה מסוג JPG, PNG או WEBP')).not.toHaveLength(0);
    expect(useAuthStore.getState().user?.avatarUrl).toBeNull();
  });

  it('removes the picture and goes back to the initials', async () => {
    setAuthUser({ name: 'דינה כהן', avatarUrl: '/files/download/u1/file.png?token=t' });
    removeAvatar.mockResolvedValue(reply(null));
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole('button', { name: /הסרת התמונה/ }));
    await waitFor(() => expect(removeAvatar).toHaveBeenCalled());
    expect(await screen.findByText('התמונה הוסרה')).toBeInTheDocument();
    expect(useAuthStore.getState().user?.avatarUrl).toBeNull();
    expect(screen.getByRole('img', { name: 'דינה כהן' })).toHaveTextContent('דכ');
    expect(screen.queryByRole('button', { name: /הסרת התמונה/ })).not.toBeInTheDocument();
  });
});
