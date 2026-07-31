import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { sendError } from '../utils/http';

const isProd = process.env.NODE_ENV === 'production';
const REFRESH_COOKIE = 'refreshToken';
const REFRESH_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// One source of truth for the refresh cookie's attributes, used for both setting
// and clearing it — the browser only deletes a cookie when the clear call uses the
// same attributes. In production the SPA is served from a different origin (Vercel)
// than the API, so the cookie must be SameSite=None + Secure to be sent at all; in
// development everything is same-origin, so SameSite=Lax without Secure works over
// plain http.
const refreshCookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? ('none' as const) : ('lax' as const),
  path: '/',
};

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const user = await authService.loginWithPassword(email, password);
    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id, role: user.role });

    res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookieOptions, maxAge: REFRESH_MAX_AGE });

    res.json({ success: true, data: { user: authService.toUserDTO(user), accessToken } });
  } catch (err: any) {
    sendError(res, err, 401);
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) { res.status(401).json({ success: false, error: 'No refresh token' }); return; }

    const payload = verifyRefreshToken(token);
    const user = await authService.getUserById(payload.userId);
    if (!user) { res.status(401).json({ success: false, error: 'User not found' }); return; }

    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const newRefreshToken = signRefreshToken({ userId: user.id, role: user.role });

    res.cookie(REFRESH_COOKIE, newRefreshToken, { ...refreshCookieOptions, maxAge: REFRESH_MAX_AGE });

    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.json({ success: true, data: null });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err, 400);
  }
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  try {
    await authService.requestPasswordReset(req.body.email);
  } catch (err) {
    console.error('forgotPassword error:', err);
  }
  // Same response whether or not the email exists — otherwise this endpoint
  // becomes a way to check which emails are registered.
  res.json({ success: true, data: null });
}

export async function resetPasswordWithToken(req: Request, res: Response): Promise<void> {
  try {
    const { token, newPassword } = req.body;
    await authService.resetPasswordWithToken(token, newPassword);
    res.json({ success: true, data: null });
  } catch (err: any) {
    sendError(res, err, 400);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const user = await authService.getUserById(req.user!.userId);
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    res.json({ success: true, data: { user: authService.toUserDTO(user) } });
  } catch (err: any) {
    sendError(res, err);
  }
}

export async function oauthCallback(req: Request, res: Response): Promise<void> {
  const user = req.user as any;
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, role: user.role });

  res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookieOptions, maxAge: REFRESH_MAX_AGE });

  res.redirect(`${process.env.OAUTH_SUCCESS_REDIRECT}?token=${accessToken}`);
}



