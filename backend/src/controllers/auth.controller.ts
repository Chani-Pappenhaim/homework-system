import { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const user = await authService.loginWithPassword(email, password);
    const accessToken = signAccessToken({ userId: user.id, role: user.role });
    const refreshToken = signRefreshToken({ userId: user.id, role: user.role });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, data: { user: authService.toUserDTO(user), accessToken } });
  } catch (err: any) {
    res.status(err.status || 401).json({ success: false, error: err.message });
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

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ success: true, data: { accessToken } });
  } catch {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
}

export async function logout(_req: Request, res: Response): Promise<void> {
  res.clearCookie('refreshToken');
  res.json({ success: true, data: null });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;
    await authService.changePassword(req.user!.userId, currentPassword, newPassword);
    res.json({ success: true, data: null });
  } catch (err: any) {
    res.status(err.status || 400).json({ success: false, error: err.message });
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const user = await authService.getUserById(req.user!.userId);
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
    res.json({ success: true, data: { user: authService.toUserDTO(user) } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function oauthCallback(req: Request, res: Response): Promise<void> {
  const user = req.user as any;
  const accessToken = signAccessToken({ userId: user.id, role: user.role });
  const refreshToken = signRefreshToken({ userId: user.id, role: user.role });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.redirect(`${process.env.OAUTH_SUCCESS_REDIRECT}?token=${accessToken}`);
}



