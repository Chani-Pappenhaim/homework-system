import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '@/pages/teacher/SettingsPage';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/messages.api', () => ({
  messagesApi: { getEmailSettings: vi.fn(), updateEmailSettings: vi.fn() },
}));
import { messagesApi } from '@/api/messages.api';
const getSettings = messagesApi.getEmailSettings as unknown as ReturnType<typeof vi.fn>;
const updateSettings = messagesApi.updateEmailSettings as unknown as ReturnType<typeof vi.fn>;

const reply = (senderName: string | null) => ({ data: { success: true, data: { senderName, defaultSenderName: 'Teacher Feature' } } });

beforeEach(() => vi.clearAllMocks());

function renderPage() {
  return renderWithProviders(<ToastProvider><SettingsPage /></ToastProvider>);
}

describe('Teacher settings - the email sender name', () => {
  it("shows the site's default while she has chosen none", async () => {
    getSettings.mockResolvedValue(reply(null));
    renderPage();
    expect(await screen.findByText('Teacher Feature')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /שמירה/ })).toBeDisabled();
  });

  it('saves the name she writes', async () => {
    getSettings.mockResolvedValue(reply(null));
    updateSettings.mockResolvedValue(reply('TeacherFeature - המורה עדי שלום'));
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText('שם השולח');
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'TeacherFeature - המורה עדי שלום');
    await user.click(screen.getByRole('button', { name: /שמירה/ }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith('TeacherFeature - המורה עדי שלום'));
    expect(await screen.findByText('שם השולח נשמר')).toBeInTheDocument();
  });

  it('loads the name she saved before', async () => {
    getSettings.mockResolvedValue(reply('המורה עדי'));
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('שם השולח')).toHaveValue('המורה עדי'));
  });
});
