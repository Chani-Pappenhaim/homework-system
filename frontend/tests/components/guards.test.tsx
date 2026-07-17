import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthGuard from '@/components/guards/AuthGuard';
import AdminGuard from '@/components/guards/AdminGuard';
import ChangePasswordGuard from '@/components/guards/ChangePasswordGuard';
import { setAuthUser, setAuthBootstrapping } from '../utils/render';

// Stub the layouts so the guards can be tested in isolation without their deps.
vi.mock('@/components/Layout/TeacherLayout', () => ({
  default: () => <div>TeacherLayout</div>,
}));
vi.mock('@/components/Layout/StudentLayout', () => ({
  default: () => <div>StudentLayout</div>,
}));

function renderGuard(guard: React.ReactNode, initial = '/protected') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/protected" element={guard} />
        <Route path="/login" element={<div>LoginPage</div>} />
        <Route path="/student" element={<div>StudentHome</div>} />
        <Route path="/change-password" element={<div>ChangePasswordPage</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => setAuthUser(null));

describe('AuthGuard', () => {
  it('redirects to /login when there is no user', () => {
    renderGuard(<AuthGuard><div>Secret</div></AuthGuard>);
    expect(screen.getByText('LoginPage')).toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });

  it('renders children when a user is present', () => {
    setAuthUser({ role: 'STUDENT' });
    renderGuard(<AuthGuard><div>Secret</div></AuthGuard>);
    expect(screen.getByText('Secret')).toBeInTheDocument();
  });

  it('waits instead of redirecting while the session is still being restored', () => {
    // Regression: the guard used to read the not-yet-loaded user as "logged out"
    // and redirect, so every reload bounced a valid session to the login page.
    setAuthBootstrapping();
    renderGuard(<AuthGuard><div>Secret</div></AuthGuard>);
    expect(screen.queryByText('LoginPage')).not.toBeInTheDocument();
    expect(screen.queryByText('Secret')).not.toBeInTheDocument();
  });
});

describe('AdminGuard', () => {
  it('redirects a student to /student', () => {
    setAuthUser({ role: 'STUDENT' });
    renderGuard(<AdminGuard />);
    expect(screen.getByText('StudentHome')).toBeInTheDocument();
  });

  it('redirects an unauthenticated visitor to /student', () => {
    renderGuard(<AdminGuard />);
    expect(screen.getByText('StudentHome')).toBeInTheDocument();
  });

  it('renders the TeacherLayout for an admin', () => {
    setAuthUser({ role: 'ADMIN' });
    renderGuard(<AdminGuard />);
    expect(screen.getByText('TeacherLayout')).toBeInTheDocument();
  });

  it('waits instead of bouncing an admin to /student mid-bootstrap', () => {
    setAuthBootstrapping();
    renderGuard(<AdminGuard />);
    expect(screen.queryByText('StudentHome')).not.toBeInTheDocument();
  });
});

describe('ChangePasswordGuard', () => {
  it('redirects to /change-password when the user must change password', () => {
    setAuthUser({ role: 'STUDENT', mustChangePassword: true });
    renderGuard(<ChangePasswordGuard><div>Inner</div></ChangePasswordGuard>);
    expect(screen.getByText('ChangePasswordPage')).toBeInTheDocument();
  });

  it('renders children when the user does not need to change password', () => {
    setAuthUser({ role: 'STUDENT', mustChangePassword: false });
    renderGuard(<ChangePasswordGuard><div>Inner</div></ChangePasswordGuard>);
    expect(screen.getByText('Inner')).toBeInTheDocument();
  });

  it('renders the StudentLayout for a student outlet (no children)', () => {
    setAuthUser({ role: 'STUDENT', mustChangePassword: false });
    renderGuard(<ChangePasswordGuard />);
    expect(screen.getByText('StudentLayout')).toBeInTheDocument();
  });
});
