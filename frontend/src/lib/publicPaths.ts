// Pages that work signed out. An expired session must not pull someone off
// them - e.g. the reset-password link from an email, opened in a fresh tab.
export const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/verify-email', '/auth/callback'];

export const isPublicPath = (pathname: string) => PUBLIC_PATHS.includes(pathname);
