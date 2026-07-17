import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TeacherLayout from '@/components/Layout/TeacherLayout';
import StudentLayout from '@/components/Layout/StudentLayout';
import { renderWithProviders, setAuthUser } from '../utils/render';

const navigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigate };
});

vi.mock('@/api/messages.api', () => ({
  messagesApi: { getUnreadCount: vi.fn() },
}));
vi.mock('@/api/auth.api', () => ({
  authApi: { logout: vi.fn(() => Promise.resolve()) },
}));

import { messagesApi } from '@/api/messages.api';
import { authApi } from '@/api/auth.api';
const getUnreadCount = messagesApi.getUnreadCount as unknown as ReturnType<typeof vi.fn>;
const logout = authApi.logout as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  setAuthUser({ name: 'מלכה', role: 'ADMIN' });
});

describe('TeacherLayout', () => {
  it('renders the main nav links', async () => {
    getUnreadCount.mockResolvedValue({ data: { data: { count: 0 } } });
    renderWithProviders(<TeacherLayout />);
    expect(screen.getByRole('link', { name: /לוח בקרה/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /קבוצות/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /ציונים/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /שימוש AI/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /הודעות/ })).toBeInTheDocument();
  });

  it('shows the current user name in the footer', async () => {
    getUnreadCount.mockResolvedValue({ data: { data: { count: 0 } } });
    renderWithProviders(<TeacherLayout />);
    expect(screen.getByText('מלכה')).toBeInTheDocument();
  });

  it('shows the unread-messages badge when count > 0', async () => {
    getUnreadCount.mockResolvedValue({ data: { data: { count: 3 } } });
    renderWithProviders(<TeacherLayout />);
    expect(await screen.findByText('3')).toBeInTheDocument();
  });

  it('navigates home when the logo is clicked', async () => {
    getUnreadCount.mockResolvedValue({ data: { data: { count: 0 } } });
    renderWithProviders(<TeacherLayout />);
    await userEvent.click(screen.getByText('מערכת שיעורי בית'));
    expect(navigate).toHaveBeenCalledWith('/teacher');
  });

  it('logs out and navigates to /login', async () => {
    getUnreadCount.mockResolvedValue({ data: { data: { count: 0 } } });
    const { container } = renderWithProviders(<TeacherLayout />);
    // The logout button is the last button in the footer.
    const buttons = container.querySelectorAll('button');
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(logout).toHaveBeenCalled());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });
});

describe('StudentLayout', () => {
  beforeEach(() => setAuthUser({ name: 'תמר', role: 'STUDENT' }));

  it('renders the student nav links', () => {
    renderWithProviders(<StudentLayout />);
    expect(screen.getByRole('link', { name: /בית/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /מטלות/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /הודעה למורה/ })).toBeInTheDocument();
  });

  it('shows the student name', () => {
    renderWithProviders(<StudentLayout />);
    expect(screen.getByText('תמר')).toBeInTheDocument();
  });

  it('navigates home when the logo is clicked', async () => {
    renderWithProviders(<StudentLayout />);
    await userEvent.click(screen.getByText('שיעורי בית'));
    expect(navigate).toHaveBeenCalledWith('/student');
  });

  it('logs out and navigates to /login', async () => {
    const { container } = renderWithProviders(<StudentLayout />);
    const buttons = container.querySelectorAll('button');
    await userEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(logout).toHaveBeenCalled());
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/login'));
  });
});
