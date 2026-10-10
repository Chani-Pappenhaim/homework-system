import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sendError, GENERIC_SERVER_ERROR } from '../../src/utils/http';
import { AppError } from '../../src/utils/errors';

function mockRes() {
  const res: any = {};
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  return res;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('sendError', () => {
  it('returns the clientMessage of a 4xx AppError', () => {
    const res = mockRes();
    sendError(res, new AppError('Lesson not found', 'השיעור לא נמצא', 404));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'השיעור לא נמצא' });
  });

  it('returns the clientMessage of a 5xx AppError', () => {
    const res = mockRes();
    sendError(res, new AppError('Failed to enqueue', 'יצירת הבוחן נכשלה', 502));
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'יצירת הבוחן נכשלה' });
  });

  it('hides the message of an unexpected error behind the generic one', () => {
    const res = mockRes();
    sendError(res, new Error('connect ECONNREFUSED 10.0.0.5:5432'));
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: GENERIC_SERVER_ERROR });
  });

  it('logs the real error for developers', () => {
    const res = mockRes();
    const err = new Error('boom');
    sendError(res, err);
    expect(console.error).toHaveBeenCalledWith('[error]', err);
  });

  it('maps a missing Prisma record to a 404 with a Hebrew message', () => {
    const res = mockRes();
    sendError(res, Object.assign(new Error('Record to update not found'), { code: 'P2025' }));
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json.mock.calls[0][0].error).toMatch(/לא נמצא/);
  });

  it('maps a broken Prisma reference to a 400 and a duplicate to a 409', () => {
    const res = mockRes();
    sendError(res, Object.assign(new Error('Foreign key constraint failed'), { code: 'P2003' }));
    expect(res.status).toHaveBeenCalledWith(400);
    const res2 = mockRes();
    sendError(res2, Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }));
    expect(res2.status).toHaveBeenCalledWith(409);
  });

  it('keeps an explicit status over the Prisma mapping', () => {
    const res = mockRes();
    sendError(res, new AppError('gone', 'ההגשה לא נמצאה', 404));
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'ההגשה לא נמצאה' });
  });

  it('replaces an English 4xx message with a generic Hebrew one', () => {
    const res = mockRes();
    sendError(res, Object.assign(new Error('Forbidden'), { status: 403 }));
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'אין לך הרשאה לבצע פעולה זו.' });
  });

  it('keeps a Hebrew 4xx message thrown without AppError', () => {
    const res = mockRes();
    sendError(res, Object.assign(new Error('השיעור לא נמצא'), { status: 404 }));
    expect(res.json).toHaveBeenCalledWith({ success: false, error: 'השיעור לא נמצא' });
  });
});
