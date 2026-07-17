import { ReactElement, ReactNode } from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import useAuthStore from '@/store/authStore';
import type { UserDTO } from '@/types';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface RenderOptions {
  initialEntries?: string[];
  /** When set, the ui is mounted at this path pattern so useParams works. */
  path?: string;
  queryClient?: QueryClient;
}

/**
 * Render a component wrapped in QueryClientProvider + MemoryRouter.
 * If `path` is provided, the component is mounted via a matching <Route> so
 * that route params (useParams) resolve against initialEntries.
 */
export function renderWithProviders(ui: ReactElement, options: RenderOptions = {}) {
  const { initialEntries = ['/'], path, queryClient = makeQueryClient() } = options;

  const wrapped: ReactNode = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  );

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{wrapped}</MemoryRouter>
    </QueryClientProvider>
  );

  return { ...result, queryClient };
}

/**
 * Reset zustand auth store to a known state (optionally with a user).
 * status is 'ready' because these tests assert post-bootstrap behaviour; use
 * setAuthBootstrapping() to exercise the loading state itself.
 */
export function setAuthUser(user: Partial<UserDTO> | null) {
  if (user) {
    useAuthStore.setState({
      user: {
        id: 'u1',
        name: 'Test User',
        email: 'test@example.com',
        role: 'STUDENT',
        mustChangePassword: false,
        ...user,
      },
      accessToken: 'token',
      status: 'ready',
    });
  } else {
    useAuthStore.setState({ user: null, accessToken: null, status: 'ready' });
  }
}

/** Put the store back in the pre-bootstrap state (refresh cookie not resolved yet). */
export function setAuthBootstrapping() {
  useAuthStore.setState({ user: null, accessToken: null, status: 'loading' });
}
