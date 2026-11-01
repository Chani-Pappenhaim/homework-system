import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { loginRateLimit } from '../../src/middleware/rateLimit';

function appWithLogin() {
  const app = express();
  app.use(express.json());
  app.post('/login', loginRateLimit, (req, res) => {
    res.status(req.body.password === 'right' ? 200 : 401).json({});
  });
  return app;
}

const attempt = (app: express.Express, email: string, password = 'wrong') =>
  request(app).post('/login').send({ email, password });

// The limiters are shared module state, so each test uses its own accounts.
describe('loginRateLimit', () => {
  it('blocks the eleventh failed attempt on one account', async () => {
    const app = appWithLogin();
    for (let i = 0; i < 10; i++) expect((await attempt(app, 'a1@x.com')).status).toBe(401);
    expect((await attempt(app, 'a1@x.com')).status).toBe(429);
  });

  it('treats the same email in another case as the same account', async () => {
    const app = appWithLogin();
    for (let i = 0; i < 10; i++) await attempt(app, 'a2@x.com');
    expect((await attempt(app, ' A2@X.com ')).status).toBe(429);
  });

  it('does not block other accounts from the same address', async () => {
    const app = appWithLogin();
    for (let i = 0; i < 10; i++) await attempt(app, 'a3@x.com');
    expect((await attempt(app, 'b3@x.com')).status).toBe(401);
  });

  it('does not count successful sign-ins', async () => {
    const app = appWithLogin();
    for (let i = 0; i < 15; i++) expect((await attempt(app, 'a4@x.com', 'right')).status).toBe(200);
  });
});
