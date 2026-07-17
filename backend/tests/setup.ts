// Global test setup — runs before every test file.
// Provide deterministic secrets so the jwt util and middleware work under test.
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';
// Make sure SMTP is unset by default so email.service takes the "skip" branch
delete process.env.SMTP_HOST;
