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
});
