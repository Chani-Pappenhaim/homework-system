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

vi.mock('@/api/grades.api', () => ({
  gradesApi: { latePolicy: vi.fn(), updateLatePolicy: vi.fn() },
}));
import { gradesApi } from '@/api/grades.api';
const getLatePolicy = gradesApi.latePolicy as unknown as ReturnType<typeof vi.fn>;
const updateLatePolicy = gradesApi.updateLatePolicy as unknown as ReturnType<typeof vi.fn>;
const latePolicyReply = (perDay: number, max: number) => ({ data: { success: true, data: { perDay, max } } });

const reply = (senderName: string | null) => ({ data: { success: true, data: { senderName, defaultSenderName: 'Teacher Feature' } } });

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue(reply(null));
  getLatePolicy.mockResolvedValue(latePolicyReply(2, 20));
});

// One save button per card: the sender name's first, the late penalty's second.
const saveButton = (card: 0 | 1) => screen.getAllByRole('button', { name: /שמירה/ })[card];

function renderPage() {
  return renderWithProviders(<ToastProvider><SettingsPage /></ToastProvider>);
}

describe('Teacher settings - the email sender name', () => {
  it("shows the site's default while she has chosen none", async () => {
    getSettings.mockResolvedValue(reply(null));
    renderPage();
    expect(await screen.findByText('Teacher Feature')).toBeInTheDocument();
    expect(saveButton(0)).toBeDisabled();
  });

  it('saves the name she writes', async () => {
    getSettings.mockResolvedValue(reply(null));
    updateSettings.mockResolvedValue(reply('TeacherFeature - המורה עדי שלום'));
    const user = userEvent.setup();
    renderPage();
    const input = await screen.findByLabelText('שם השולח');
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'TeacherFeature - המורה עדי שלום');
    await user.click(saveButton(0));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith('TeacherFeature - המורה עדי שלום'));
    expect(await screen.findByText('שם השולח נשמר')).toBeInTheDocument();
  });

  it('loads the name she saved before', async () => {
    getSettings.mockResolvedValue(reply('המורה עדי'));
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('שם השולח')).toHaveValue('המורה עדי'));
  });
});

describe('Teacher settings - the late penalty', () => {
  it('loads the penalty and shows what it does to a full score', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByLabelText('נקודות לכל יום איחור')).toHaveValue(2));
    expect(screen.getByLabelText('הורדה מקסימלית')).toHaveValue(20);
    // 1 day: 98, 3 days: 94, 10 days: capped at 20 -> 80.
    expect(screen.getByText('98')).toBeInTheDocument();
    expect(screen.getByText('94')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(saveButton(1)).toBeDisabled();
  });

  it('saves the penalty she sets', async () => {
    updateLatePolicy.mockResolvedValue(latePolicyReply(5, 30));
    const user = userEvent.setup();
    renderPage();
    const perDay = await screen.findByLabelText('נקודות לכל יום איחור');
    await waitFor(() => expect(perDay).toHaveValue(2));
    await user.clear(perDay);
    await user.type(perDay, '5');
    const max = screen.getByLabelText('הורדה מקסימלית');
    await user.clear(max);
    await user.type(max, '30');
    await user.click(saveButton(1));
    await waitFor(() => expect(updateLatePolicy).toHaveBeenCalledWith({ perDay: 5, max: 30 }));
    expect(await screen.findByText('הקנס על איחור נשמר')).toBeInTheDocument();
  });

  it('will not save a value outside 0-100', async () => {
    const user = userEvent.setup();
    renderPage();
    const max = await screen.findByLabelText('הורדה מקסימלית');
    await waitFor(() => expect(max).toHaveValue(20));
    await user.clear(max);
    await user.type(max, '150');
    expect(screen.getByText('יש לכתוב מספרים שלמים בין 0 ל-100')).toBeInTheDocument();
    expect(saveButton(1)).toBeDisabled();
  });
});
