import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from '@/pages/auth/LoginPage';
import { renderWithProviders, setAuthUser } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/auth.api', () => ({
  authApi: { login: vi.fn() },
}));

import { authApi } from '@/api/auth.api';
const loginMock = authApi.login as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser(null);
});

describe('LoginPage', () => {
  it('renders the login form fields and submit button', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'כניסה למערכת' })).toBeInTheDocument();
  });

  it('renders OAuth buttons', () => {
    renderWithProviders(<LoginPage />);
    expect(screen.getByRole('button', { name: /Google/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /GitHub/ })).toBeInTheDocument();
  });

  it('calls authApi.login on submit and navigates a student to /student', async () => {
    loginMock.mockResolvedValue({
      data: { data: { user: { role: 'STUDENT', mustChangePassword: false }, accessToken: 'tok' } },
    });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'a@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'כניסה למערכת' }));

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('a@b.com', 'secret'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/student'));
  });

  it('navigates an admin to /teacher', async () => {
    loginMock.mockResolvedValue({
      data: { data: { user: { role: 'ADMIN', mustChangePassword: false }, accessToken: 'tok' } },
    });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'admin@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'כניסה למערכת' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/teacher'));
  });

  it('navigates to /change-password when mustChangePassword is set', async () => {
    loginMock.mockResolvedValue({
      data: { data: { user: { role: 'STUDENT', mustChangePassword: true }, accessToken: 'tok' } },
    });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'x@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: 'כניסה למערכת' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/change-password'));
  });

  it('shows an error message when login fails', async () => {
    loginMock.mockRejectedValue({ response: { data: { error: 'סיסמא שגויה' } } });
    renderWithProviders(<LoginPage />);
    await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'x@b.com');
    await userEvent.type(screen.getByPlaceholderText('••••••••'), 'bad');
    await userEvent.click(screen.getByRole('button', { name: 'כניסה למערכת' }));
    expect(await screen.findByText('סיסמא שגויה')).toBeInTheDocument();
  });
});
