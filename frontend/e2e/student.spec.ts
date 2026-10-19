import { test, expect, ok, signIn, teacher } from './fixtures';

const student = { ...teacher, id: 's1', name: 'דנה כהן', email: 'dana@example.com', role: 'STUDENT' };

test('a partial attendance shows by name and counts as half an absence', async ({ page, api }) => {
  signIn(api, student);
  api.on('GET', '/attendance/me', ok({
    courses: [{
      courseId: 'c1', courseName: 'React',
      summary: { present: 1, absent: 0, partial: 1, sessions: 2 },
      sessions: [
        { id: 'a1', date: '2026-10-05T00:00:00.000Z', title: 'Hooks', status: 'PRESENT', homework: [] },
        { id: 'a2', date: '2026-10-12T00:00:00.000Z', title: 'Context', status: 'PARTIAL', homework: [] },
      ],
    }],
  }));
  await page.goto('/student/attendance');
  await expect(page.getByText('75%')).toBeVisible();
  await expect(page.getByText('נוכחות חלקית').first()).toBeVisible();
});
