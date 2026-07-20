import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

export const authRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const generalRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 1000,
  message: { success: false, error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Routes that can cause a paid AI call. The general limit of 1000/min is no
 * limit at all when each request may bill a Claude or Gemini job, so these are
 * kept deliberately tight and keyed per user rather than per IP (a whole class
 * can share one school NAT address).
 */
export const aiRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, error: 'Too many AI requests, please try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
  // Authenticated requests are keyed per user; unauthenticated ones fall back to
  // the IP. ipKeyGenerator normalises IPv6 addresses (masking to a /64) so an IPv6
  // client cannot rotate addresses to bypass the limit.
  keyGenerator: (req) => req.user?.userId ?? ipKeyGenerator(req.ip ?? 'anonymous'),
});
