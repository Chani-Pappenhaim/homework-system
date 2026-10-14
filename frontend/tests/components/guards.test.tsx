import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AuthGuard from '@/components/guards/AuthGuard';
import AdminGuard from '@/components/guards/AdminGuard';
import ChangePasswordGuard from '@/components/guards/ChangePasswordGuard';
import StudentGuard, { teacherPathFor } from '@/components/guards/StudentGuard';
import { useLocation } from 'react-router-dom';
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

function Where() {
  const { pathname, search } = useLocation();
  return <div>at {pathname + search}</div>;
}

function renderStudentGuard(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/student/*" element={<StudentGuard />} />
        <Route path="/teacher/*" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('StudentGuard', () => {
  it('renders the StudentLayout for a student', () => {
    setAuthUser({ role: 'STUDENT' });
    renderStudentGuard('/student/messages');
    expect(screen.getByText('StudentLayout')).toBeInTheDocument();
  });

  it('sends a teacher who opens a student message link to the same conversation on her side', () => {
    // Regression: the page rendered with no layout and failing requests
    setAuthUser({ role: 'ADMIN' });
    renderStudentGuard('/student/messages?highlight=m1');
    expect(screen.queryByText('StudentLayout')).not.toBeInTheDocument();
    expect(screen.getByText('at /teacher/messages?highlight=m1')).toBeInTheDocument();
  });

  it('sends a teacher on a student-only page to the teacher home page', () => {
    setAuthUser({ role: 'ADMIN' });
    renderStudentGuard('/student/assignments');
    expect(screen.getByText('at /teacher')).toBeInTheDocument();
  });

  it('waits instead of redirecting mid-bootstrap', () => {
    setAuthBootstrapping();
    renderStudentGuard('/student/messages');
    expect(screen.queryByText(/^at /)).not.toBeInTheDocument();
    expect(screen.queryByText('StudentLayout')).not.toBeInTheDocument();
  });
});

describe('teacherPathFor', () => {
  it.each([
    ['/student/messages', '?highlight=m1', '/teacher/messages?highlight=m1'],
    ['/student/courses/JS', '', '/teacher/courses/JS'],
    ['/student/courses/JS/lessons/3', '', '/teacher/courses/JS/lessons/3'],
    ['/student/lessons/l1', '?assignmentId=a1', '/teacher/lessons/l1?assignmentId=a1'],
    ['/student/quiz/l1', '', '/teacher/quiz/l1'],
    ['/student', '', '/teacher'],
    ['/student/assignments', '', '/teacher'],
    ['/student/attendance', '', '/teacher'],
    ['/student/profile', '', '/teacher'],
    ['/student/courses', '', '/teacher/courses'],
  ])('%s%s -> %s', (pathname, search, expected) => {
    expect(teacherPathFor(pathname, search)).toBe(expected);
  });
});
