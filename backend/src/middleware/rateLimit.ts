import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'יותר מדי בקשות. אנא נסו שוב בעוד כמה דקות.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const TOO_MANY_LOGINS = { success: false, error: 'יותר מדי ניסיונות התחברות. אנא נסו שוב בעוד כמה דקות.' };

/**
 * Failed sign-ins are counted per account and address together, so guessing one
 * account's password is stopped quickly while a class sharing one address is not
 * blocked by a single person's mistakes. Successful sign-ins do not count, and
 * the block is temporary: a permanent lock would let anyone lock a teacher out.
 */
const loginAttemptsPerAccount = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: TOO_MANY_LOGINS,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return `${ipKeyGenerator(req.ip ?? 'anonymous')}|${email}`;
  },
});

// A wide cap per address, against one source trying many different accounts.
const loginAttemptsPerAddress = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: TOO_MANY_LOGINS,
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginRateLimit = [loginAttemptsPerAddress, loginAttemptsPerAccount];

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { success: false, error: 'יותר מדי בקשות. אנא נסו שוב בעוד כמה דקות.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Routes that can cause a paid AI call. The general limit of 1000/min is no
 * limit at all when each request may bill a Claude or Gemini job, so these are
 * kept deliberately tight and keyed per user rather than per IP (a whole class
 * can share one shared NAT address).
 *
 * The cap must stay well above any legitimate polling rate (a status-polling
 * client hitting this endpoint every few seconds should never trip its own limit).
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { success: false, error: 'יותר מדי בקשות לבדיקת AI. אנא נסו שוב בעוד דקה.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Authenticated requests are keyed per user; unauthenticated ones fall back to
  // the IP. ipKeyGenerator normalises IPv6 addresses (masking to a /64) so an IPv6
  // client cannot rotate addresses to bypass the limit.
  keyGenerator: (req) => req.user?.userId ?? ipKeyGenerator(req.ip ?? 'anonymous'),
});
