// Global test setup — runs before every test file.
// Provide deterministic secrets so the jwt util and middleware work under test.
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.NODE_ENV = 'test';
// The central Redis module throws if REDIS_URL is missing; give it a harmless
// default so tests that import the real queue graph (with bullmq mocked) load.
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
// Make sure SMTP is unset by default so email.service takes the "skip" branch
delete process.env.SMTP_HOST;
