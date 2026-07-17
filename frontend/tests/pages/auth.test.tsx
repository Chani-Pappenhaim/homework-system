import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage';
import OAuthCallbackPage from '@/pages/auth/OAuthCallbackPage';
import { renderWithProviders, setAuthUser } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/auth.api', () => ({
  authApi: { changePassword: vi.fn(), me: vi.fn() },
}));

import { authApi } from '@/api/auth.api';
const changePassword = authApi.changePassword as unknown as ReturnType<typeof vi.fn>;
const me = authApi.me as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser({ name: 'רבקה', role: 'STUDENT' });
});

describe('ChangePasswordPage', () => {
  // Input labels are not linked to inputs (no htmlFor/id), so query by order.
  function fields(container: HTMLElement) {
    const inputs = container.querySelectorAll('input[type="password"]');
    return { current: inputs[0], next: inputs[1], confirm: inputs[2] };
  }

  it('renders the form and greets the user', () => {
    renderWithProviders(<ChangePasswordPage />);
    expect(screen.getByText(/ברוכה הבאה, רבקה/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'שמור סיסמא חדשה' })).toBeInTheDocument();
  });

  it('validates minimum length', async () => {
    const { container } = renderWithProviders(<ChangePasswordPage />);
    const f = fields(container);
    await userEvent.type(f.current, 'oldpass');
    await userEvent.type(f.next, '123');
    await userEvent.type(f.confirm, '123');
    await userEvent.click(screen.getByRole('button', { name: 'שמור סיסמא חדשה' }));
    expect(await screen.findByText(/לפחות 6 תווים/)).toBeInTheDocument();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('validates that passwords match', async () => {
    const { container } = renderWithProviders(<ChangePasswordPage />);
    const f = fields(container);
    await userEvent.type(f.current, 'oldpass');
    await userEvent.type(f.next, 'abcdef');
    await userEvent.type(f.confirm, 'abcdeg');
    await userEvent.click(screen.getByRole('button', { name: 'שמור סיסמא חדשה' }));
    expect(await screen.findByText('הסיסמאות אינן תואמות')).toBeInTheDocument();
  });

  it('submits and navigates to /student on success', async () => {
    changePassword.mockResolvedValue({ data: {} });
    const { container } = renderWithProviders(<ChangePasswordPage />);
    const f = fields(container);
    await userEvent.type(f.current, 'oldpass');
    await userEvent.type(f.next, 'abcdef');
    await userEvent.type(f.confirm, 'abcdef');
    await userEvent.click(screen.getByRole('button', { name: 'שמור סיסמא חדשה' }));
    await waitFor(() => expect(changePassword).toHaveBeenCalledWith('oldpass', 'abcdef'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/student'));
  });

  it('shows a server error message on failure', async () => {
    changePassword.mockRejectedValue({ response: { data: { error: 'סיסמא נוכחית שגויה' } } });
    const { container } = renderWithProviders(<ChangePasswordPage />);
    const f = fields(container);
    await userEvent.type(f.current, 'wrong');
    await userEvent.type(f.next, 'abcdef');
    await userEvent.type(f.confirm, 'abcdef');
    await userEvent.click(screen.getByRole('button', { name: 'שמור סיסמא חדשה' }));
    expect(await screen.findByText('סיסמא נוכחית שגויה')).toBeInTheDocument();
  });
});

describe('OAuthCallbackPage', () => {
  it('redirects to /login when there is no token in the URL', async () => {
    renderWithProviders(<OAuthCallbackPage />, { initialEntries: ['/auth/callback'] });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });

  it('loads the user and navigates to /student for a token', async () => {
    me.mockResolvedValue({ data: { data: { user: { id: 'u', name: 'N', email: 'e', role: 'STUDENT', mustChangePassword: false } } } });
    renderWithProviders(<OAuthCallbackPage />, { initialEntries: ['/auth/callback?token=abc'] });
    await waitFor(() => expect(me).toHaveBeenCalled());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/student'));
  });

  it('navigates to /teacher for an admin token', async () => {
    me.mockResolvedValue({ data: { data: { user: { id: 'u', name: 'N', email: 'e', role: 'ADMIN', mustChangePassword: false } } } });
    renderWithProviders(<OAuthCallbackPage />, { initialEntries: ['/auth/callback?token=abc'] });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher'));
  });

  it('navigates to /change-password when the user must change password', async () => {
    me.mockResolvedValue({ data: { data: { user: { id: 'u', name: 'N', email: 'e', role: 'STUDENT', mustChangePassword: true } } } });
    renderWithProviders(<OAuthCallbackPage />, { initialEntries: ['/auth/callback?token=abc'] });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/change-password'));
  });

  it('redirects to /login when the me() call fails', async () => {
    me.mockRejectedValue(new Error('bad token'));
    renderWithProviders(<OAuthCallbackPage />, { initialEntries: ['/auth/callback?token=abc'] });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });
});
