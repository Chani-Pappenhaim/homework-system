import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/infrastructure/queues/enqueue-email', () => ({ enqueueEmail: vi.fn() }));
vi.mock('../../src/services/settings.service', () => ({ getQuietHours: vi.fn() }));

import { enqueueEmail } from '../../src/infrastructure/queues/enqueue-email';
import { getQuietHours } from '../../src/services/settings.service';
import { enqueueStudentEmail } from '../../src/services/student-notifications.service';

const data = { messageId: 'm1', studentName: 'רחל', studentEmail: 'r@x.com', content: 'שלום' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(getQuietHours).mockResolvedValue({ startMinute: 0, releaseMinute: 600 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('enqueueStudentEmail', () => {
  it('sends at once outside quiet hours', async () => {
    vi.setSystemTime(new Date('2026-11-01T12:00:00Z')); // 14:00
    await enqueueStudentEmail('teacher-message', data);
    expect(enqueueEmail).toHaveBeenCalledWith('teacher-message', data, undefined);
  });

  it('holds the email until the release time during quiet hours', async () => {
    vi.setSystemTime(new Date('2026-11-01T01:00:00Z')); // 03:00
    await enqueueStudentEmail('teacher-message', data);
    expect(enqueueEmail).toHaveBeenCalledWith('teacher-message', data, { delay: 7 * 60 * 60 * 1000 });
  });

  it('sends at once when quiet hours are off', async () => {
    vi.mocked(getQuietHours).mockResolvedValue({ startMinute: 0, releaseMinute: 0 });
    vi.setSystemTime(new Date('2026-11-01T01:00:00Z'));
    await enqueueStudentEmail('teacher-message', data);
    expect(enqueueEmail).toHaveBeenCalledWith('teacher-message', data, undefined);
  });
});
