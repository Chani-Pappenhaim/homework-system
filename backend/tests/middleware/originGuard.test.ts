import { describe, it, expect, vi } from 'vitest';
import { originGuard } from '../../src/middleware/originGuard';

function run(method: string, origin: string | undefined, allowed = 'https://app.example') {
  const req = { method, headers: origin ? { origin } : {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
  const next = vi.fn();
  originGuard(allowed)(req, res, next);
  return { res, next };
}

describe('originGuard', () => {
  it('lets the app itself through', () => {
    expect(run('POST', 'https://app.example').next).toHaveBeenCalled();
  });

  it('accepts a configured origin written with a trailing slash', () => {
    expect(run('POST', 'https://app.example', 'https://app.example/').next).toHaveBeenCalled();
  });

  it('refuses a state-changing request from a sandboxed frame', () => {
    const { res, next } = run('POST', 'null');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('refuses a state-changing request from another site', () => {
    expect(run('DELETE', 'https://evil.example').res.status).toHaveBeenCalledWith(403);
  });

  it('leaves reads and requests without an Origin alone', () => {
    expect(run('GET', 'https://evil.example').next).toHaveBeenCalled();
    expect(run('POST', undefined).next).toHaveBeenCalled();
  });
});
