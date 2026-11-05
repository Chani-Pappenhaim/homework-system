import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '@/pages/teacher/SettingsPage';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/messages.api', () => ({
  messagesApi: { getEmailSettings: vi.fn(), updateEmailSettings: vi.fn(), getQuietHours: vi.fn(), updateQuietHours: vi.fn() },
}));
import { messagesApi } from '@/api/messages.api';
const getSettings = messagesApi.getEmailSettings as unknown as ReturnType<typeof vi.fn>;
const updateSettings = messagesApi.updateEmailSettings as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/api/site.api', () => ({ siteApi: { get: vi.fn(), update: vi.fn() } }));
import { siteApi } from '@/api/site.api';
import { getSiteNames, setSiteNames, DEFAULT_SITE_NAMES } from '@/lib/siteNames';
const updateSite = siteApi.update as unknown as ReturnType<typeof vi.fn>;

vi.mock('@/api/grades.api', () => ({
  gradesApi: { latePolicy: vi.fn(), updateLatePolicy: vi.fn() },
}));
import { gradesApi } from '@/api/grades.api';
const getLatePolicy = gradesApi.latePolicy as unknown as ReturnType<typeof vi.fn>;
const updateLatePolicy = gradesApi.updateLatePolicy as unknown as ReturnType<typeof vi.fn>;
const latePolicyReply = (perDay: number, max: number) => ({ data: { success: true, data: { perDay, max } } });

vi.mock('@/api/auth.api', () => ({ authApi: { logoutOthers: vi.fn(), changePassword: vi.fn() } }));
import { authApi } from '@/api/auth.api';
import useAuthStore from '@/store/authStore';
const logoutOthers = authApi.logoutOthers as unknown as ReturnType<typeof vi.fn>;
const changePassword = authApi.changePassword as unknown as ReturnType<typeof vi.fn>;

const getQuietHours = messagesApi.getQuietHours as unknown as ReturnType<typeof vi.fn>;
const updateQuietHours = messagesApi.updateQuietHours as unknown as ReturnType<typeof vi.fn>;
const quietReply = (startMinute: number, releaseMinute: number) => ({ data: { success: true, data: { startMinute, releaseMinute } } });

const reply = (senderName: string | null) => ({ data: { success: true, data: { senderName, defaultSenderName: 'Teacher Feature' } } });

beforeEach(() => {
  vi.clearAllMocks();
  getSettings.mockResolvedValue(reply(null));
  getLatePolicy.mockResolvedValue(latePolicyReply(2, 20));
  getQuietHours.mockResolvedValue(quietReply(0, 600));
  setSiteNames(DEFAULT_SITE_NAMES);
});

// Settings show a summary until "עריכה" is pressed; the cards, top to bottom: site name, sender name, late penalty, quiet hours.
const CARD = { site: 0, sender: 1, late: 2, quiet: 3 } as const;
async function startEditing(card: number) {
  const buttons = await screen.findAllByRole('button', { name: /עריכה/ });
  await userEvent.click(buttons[card]);
}
// Cards already being edited have no edit button; their save button is the n-th save button on the page.
const saveButton = () => screen.getByRole('button', { name: /שמירה/ });

function renderPage() {
  return renderWithProviders(<ToastProvider><SettingsPage /></ToastProvider>);
}

describe('Teacher settings - the email sender name', () => {
  it("shows the site's default while she has chosen none", async () => {
    getSettings.mockResolvedValue(reply(null));
    renderPage();
    // Both the site-name card and the sender card show it.
    await waitFor(() => expect(screen.getAllByText('Teacher Feature')).toHaveLength(2));
    expect(screen.queryByLabelText('שם השולח')).not.toBeInTheDocument();
    await startEditing(CARD.sender);
    expect(saveButton()).toBeDisabled();
  });

  it('saves the name she writes', async () => {
    getSettings.mockResolvedValue(reply(null));
    updateSettings.mockResolvedValue(reply('TeacherFeature - המורה עדי שלום'));
    const user = userEvent.setup();
    renderPage();
    await startEditing(CARD.sender);
    const input = await screen.findByLabelText('שם השולח');
    await waitFor(() => expect(input).toBeEnabled());
    await user.type(input, 'TeacherFeature - המורה עדי שלום');
    await user.click(saveButton());
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith('TeacherFeature - המורה עדי שלום'));
    expect(await screen.findByText('שם השולח נשמר')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText('שם השולח')).not.toBeInTheDocument());
  });

  it('loads the name she saved before', async () => {
    getSettings.mockResolvedValue(reply('המורה עדי'));
    renderPage();
    expect(await screen.findByText('המורה עדי')).toBeInTheDocument();
    await startEditing(CARD.sender);
    await waitFor(() => expect(screen.getByLabelText('שם השולח')).toHaveValue('המורה עדי'));
  });
});

describe('Teacher settings - the late penalty', () => {
  it('loads the penalty and shows what it does to a full score', async () => {
    renderPage();
    expect(await screen.findByText(/נקודות לכל יום איחור, עד הורדה של/)).toBeInTheDocument();
    await startEditing(CARD.late);
    await waitFor(() => expect(screen.getByLabelText('נקודות לכל יום איחור')).toHaveValue(2));
    expect(screen.getByLabelText('הורדה מקסימלית')).toHaveValue(20);
    // 1 day: 98, 3 days: 94, 10 days: capped at 20 -> 80.
    expect(screen.getByText('98')).toBeInTheDocument();
    expect(screen.getByText('94')).toBeInTheDocument();
    expect(screen.getByText('80')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('saves the penalty she sets', async () => {
    updateLatePolicy.mockResolvedValue(latePolicyReply(5, 30));
    const user = userEvent.setup();
    renderPage();
    await startEditing(CARD.late);
    const perDay = await screen.findByLabelText('נקודות לכל יום איחור');
    await waitFor(() => expect(perDay).toHaveValue(2));
    await user.clear(perDay);
    await user.type(perDay, '5');
    const max = screen.getByLabelText('הורדה מקסימלית');
    await user.clear(max);
    await user.type(max, '30');
    await user.click(saveButton());
    await waitFor(() => expect(updateLatePolicy).toHaveBeenCalledWith({ perDay: 5, max: 30 }));
    expect(await screen.findByText('הקנס על איחור נשמר')).toBeInTheDocument();
  });

  it('will not save a value outside 0-100', async () => {
    const user = userEvent.setup();
    renderPage();
    await startEditing(CARD.late);
    const max = await screen.findByLabelText('הורדה מקסימלית');
    await waitFor(() => expect(max).toHaveValue(20));
    await user.clear(max);
    await user.type(max, '150');
    expect(screen.getByText('יש לכתוב מספרים שלמים בין 0 ל-100')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('drops an unsaved edit when she cancels', async () => {
    const user = userEvent.setup();
    renderPage();
    await startEditing(CARD.late);
    const perDay = await screen.findByLabelText('נקודות לכל יום איחור');
    await waitFor(() => expect(perDay).toHaveValue(2));
    await user.clear(perDay);
    await user.type(perDay, '9');
    await user.click(screen.getByRole('button', { name: 'ביטול' }));
    expect(screen.queryByLabelText('נקודות לכל יום איחור')).not.toBeInTheDocument();
    await startEditing(CARD.late);
    expect(await screen.findByLabelText('נקודות לכל יום איחור')).toHaveValue(2);
  });
});

describe('Teacher settings - signing out other devices', () => {
  const button = () => screen.getByRole('button', { name: /התנתקות מכל המכשירים האחרים/ });

  it('asks first, then keeps this device signed in on the new token', async () => {
    logoutOthers.mockResolvedValue({ data: { success: true, data: { accessToken: 'fresh-token' } } });
    renderPage();
    await userEvent.click(button());
    expect(logoutOthers).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'ניתוק' }));
    await waitFor(() => expect(logoutOthers).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('fresh-token'));
    expect(await screen.findByText('נותקת מכל המכשירים האחרים')).toBeInTheDocument();
  });

  it('does nothing when she cancels', async () => {
    renderPage();
    await userEvent.click(button());
    await userEvent.click(await screen.findByRole('button', { name: /ביטול/ }));
    expect(logoutOthers).not.toHaveBeenCalled();
  });

  it('reports a failure', async () => {
    logoutOthers.mockRejectedValue(new Error('network'));
    renderPage();
    await userEvent.click(button());
    await userEvent.click(await screen.findByRole('button', { name: 'ניתוק' }));
    expect(await screen.findByText('הניתוק נכשל')).toBeInTheDocument();
  });
});

describe('Teacher settings - quiet hours', () => {
  const startField = () => screen.getByLabelText('תחילת שעות השקט') as HTMLInputElement;
  const releaseField = () => screen.getByLabelText('שעת שחרור המיילים') as HTMLInputElement;
  const save = () => saveButton();
  const edit = () => startEditing(CARD.quiet);

  it('shows the saved hours', async () => {
    getQuietHours.mockResolvedValue(quietReply(1320, 450));
    renderPage();
    expect(await screen.findByText('22:00')).toBeInTheDocument();
    await edit();
    await waitFor(() => expect(startField().value).toBe('22:00'));
    expect(releaseField().value).toBe('07:30');
  });

  it('saves the release time she picks as minutes past midnight', async () => {
    updateQuietHours.mockResolvedValue(quietReply(0, 660));
    renderPage();
    await edit();
    await waitFor(() => expect(releaseField().value).toBe('10:00'));
    expect(save()).toBeDisabled();
    fireEvent.change(releaseField(), { target: { value: '11:00' } });
    await userEvent.click(save());
    await waitFor(() => expect(updateQuietHours).toHaveBeenCalledWith({ startMinute: 0, releaseMinute: 660 }));
    expect(await screen.findByText('שעות השקט נשמרו')).toBeInTheDocument();
  });

  it('says there are no quiet hours when both times are equal', async () => {
    renderPage();
    await edit();
    await waitFor(() => expect(releaseField().value).toBe('10:00'));
    fireEvent.change(startField(), { target: { value: '10:00' } });
    expect(await screen.findByText(/אין שעות שקט/)).toBeInTheDocument();
  });
});

describe('Teacher settings - changing her password', () => {
  const fill = async (cur: string, next: string, confirm: string) => {
    await userEvent.type(await screen.findByLabelText('סיסמה נוכחית'), cur);
    await userEvent.type(screen.getByLabelText('סיסמה חדשה'), next);
    await userEvent.type(screen.getByLabelText('אימות סיסמה חדשה'), confirm);
    await userEvent.click(screen.getByRole('button', { name: /עדכון סיסמה/ }));
  };

  it('sends the current and new password and confirms', async () => {
    changePassword.mockResolvedValue({ data: { data: { accessToken: 'new-token' } } });
    renderPage();
    await fill('old-pass', 'new-pass1', 'new-pass1');
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('old-pass', 'new-pass1'));
    expect(await screen.findByText('הסיסמה עודכנה')).toBeInTheDocument();
  });

  it('rejects a mismatched confirmation without calling the server', async () => {
    renderPage();
    await fill('old-pass', 'new-pass1', 'other-pass');
    expect(await screen.findByText('הסיסמאות אינן תואמות')).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('rejects a password shorter than six characters', async () => {
    renderPage();
    await fill('old-pass', '123', '123');
    expect(await screen.findByText(/לפחות 6 תווים/)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });
});

describe('Teacher settings - the site names', () => {
  it('saves both names and shows them everywhere at once', async () => {
    updateSite.mockResolvedValue({ data: { success: true, data: { brandName: 'My Site', teacherName: 'המורה עדי כהן' } } });
    renderPage();
    await startEditing(CARD.site);
    const brand = screen.getByLabelText('שם האתר');
    await userEvent.clear(brand);
    await userEvent.type(brand, 'My Site');
    const teacher = screen.getByLabelText('שורת המורה');
    await userEvent.clear(teacher);
    await userEvent.type(teacher, 'המורה עדי כהן');
    await userEvent.click(saveButton());
    await waitFor(() => expect(updateSite).toHaveBeenCalledWith({ brandName: 'My Site', teacherName: 'המורה עדי כהן' }));
    await waitFor(() => expect(getSiteNames()).toEqual({ brandName: 'My Site', teacherName: 'המורה עדי כהן' }));
    expect(await screen.findByText('My Site', { selector: 'span' })).toBeInTheDocument();
  });

  it('keeps save disabled until a name changes', async () => {
    renderPage();
    await startEditing(CARD.site);
    expect(saveButton()).toBeDisabled();
  });
});
