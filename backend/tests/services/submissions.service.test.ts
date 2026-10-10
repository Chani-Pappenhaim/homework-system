import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/config/prisma', () => ({
  prisma: {
    assignment: { findUnique: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
    submission: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    grade: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

const { uploadMock, signatureMock, assertAccessMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  signatureMock: vi.fn(),
  assertAccessMock: vi.fn(),
}));
const { destroyMock, confirmMock, discardMock, releaseMock } = vi.hoisted(() => ({
  destroyMock: vi.fn(), confirmMock: vi.fn(), discardMock: vi.fn(), releaseMock: vi.fn(),
}));
vi.mock('../../src/utils/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/storage')>()),
  uploadBuffer: uploadMock,
  createUploadSignature: signatureMock,
  destroyByUrl: destroyMock,
}));
vi.mock('../../src/utils/pending-uploads', () => ({ confirmUpload: confirmMock, discardPendingUpload: discardMock }));
vi.mock('../../src/utils/file-refs', () => ({ releaseFileUrls: releaseMock }));
vi.mock('../../src/utils/access', () => ({
  assertLessonAccess: assertAccessMock,
}));
const { aiQueueAdd } = vi.hoisted(() => ({ aiQueueAdd: vi.fn() }));
vi.mock('../../src/infrastructure/queues/queues', () => ({
  aiReviewQueue: { add: aiQueueAdd },
  emailQueue: { add: vi.fn() },
}));
const { repoStatusMock } = vi.hoisted(() => ({ repoStatusMock: vi.fn() }));
vi.mock('../../src/utils/github', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/github')>()),
  getRepoStatus: repoStatusMock,
}));

import ExcelJS from 'exceljs';
import { prisma } from '../../src/config/prisma';
import {
  submitAssignment,
  getMySubmissions,
  getSubmissionById,
  importSubmissions,
  getVideoUploadSignature,
  rerunAiReview,
  requestAiReview,
} from '../../src/services/submissions.service';

process.env.CLOUDINARY_CLOUD_NAME = 'our-cloud';
const OWN_UPLOAD = 'https://res.cloudinary.com/our-cloud/video/upload/v1/submissions/clip.mp4';

async function xlsxBuffer(rows: string[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('S');
  sheet.addRow(['Assignment', 'Email', 'Repo']); // header
  rows.forEach((r) => sheet.addRow(r));
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

const p = prisma as any;

const baseAssignment = (over: any = {}) => ({
  id: 'a1', lessonId: 'l1', allowGithub: true, allowFile: true, allowedTypes: [] as string[],
  deadline: null, lesson: { id: 'l1', course: { groupId: 'g1' } },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  // assertLessonAccess resolves when access is granted and throws when it isn't
  assertAccessMock.mockResolvedValue(undefined);
  repoStatusMock.mockResolvedValue('exists');
});

describe('submissions.service.submitAssignment', () => {
  it('throws 404 when the assignment does not exist', async () => {
    p.assignment.findUnique.mockResolvedValue(null);
    await expect(submitAssignment('a1', 's1', { repoName: 'r' })).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when the student has no lesson access', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    assertAccessMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(submitAssignment('a1', 's1', { repoName: 'r' })).rejects.toMatchObject({ status: 403 });
  });

  it('builds githubUrl from githubUsername + repoName', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: 'dina' });
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await submitAssignment('a1', 's1', { repoName: 'my-repo' });
    expect(r.githubUrl).toBe('https://github.com/dina/my-repo');
  });

  it('accepts a pasted repo URL and keeps only the repo name', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: 'dina' });
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await submitAssignment('a1', 's1', { repoName: ' https://github.com/dina/my-repo.git ' });
    expect(r.githubUrl).toBe('https://github.com/dina/my-repo');
    expect(repoStatusMock).toHaveBeenCalledWith('dina', 'my-repo');
  });

  it('rejects a repo that does not exist on GitHub, without saving', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: 'dina' });
    repoStatusMock.mockResolvedValue('missing');
    await expect(submitAssignment('a1', 's1', { repoName: 'typo-repo' })).rejects.toMatchObject({ status: 400 });
    expect(p.submission.create).not.toHaveBeenCalled();
    expect(p.grade.upsert).not.toHaveBeenCalled();
  });

  it('rejects the submission with a retry message when GitHub cannot verify the repo', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: 'dina' });
    p.submission.findUnique.mockResolvedValue(null);
    repoStatusMock.mockResolvedValue('unknown');
    await expect(submitAssignment('a1', 's1', { repoName: 'my-repo' })).rejects.toMatchObject({ status: 503 });
    expect(p.submission.create).not.toHaveBeenCalled();
  });

  it('throws 400 when repo submitted but student has no githubUsername', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: null });
    await expect(submitAssignment('a1', 's1', { repoName: 'r' })).rejects.toMatchObject({ status: 400 });
  });

  it('throws 400 when repo submitted but allowGithub is false', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowGithub: false }));
    await expect(submitAssignment('a1', 's1', { repoName: 'r' })).rejects.toMatchObject({
      status: 400, message: 'GitHub not allowed for this assignment',
    });
  });

  it('throws 400 when file submitted but allowFile is false', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowFile: false }));
    await expect(submitAssignment('a1', 's1', {
      file: { buffer: Buffer.from('x'), originalName: 'a.js', mimeType: 'text/js' },
    })).rejects.toMatchObject({ status: 400, message: 'File upload not allowed for this assignment' });
  });

  it('throws 400 when file extension not in allowedTypes', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowedTypes: ['pdf'] }));
    await expect(submitAssignment('a1', 's1', {
      file: { buffer: Buffer.from('x'), originalName: 'code.js', mimeType: 'text/js' },
    })).rejects.toMatchObject({ status: 400 });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('uploads the file via storage and stores its url + name', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowedTypes: ['js'] }));
    uploadMock.mockResolvedValue({ url: 'https://cdn/x.js', bytes: 10, resourceType: 'raw', publicId: 'p' });
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await submitAssignment('a1', 's1', {
      file: { buffer: Buffer.from('code'), originalName: 'code.js', mimeType: 'text/js' },
    });
    expect(uploadMock).toHaveBeenCalled();
    expect(r.fileUrl).toBe('https://cdn/x.js');
    expect(r.fileName).toBe('code.js');
  });

  it('throws 400 when neither file nor repo is provided', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    await expect(submitAssignment('a1', 's1', {})).rejects.toMatchObject({ status: 400 });
  });

  it('stores an already-uploaded file url without touching storage.uploadBuffer', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowedTypes: ['mp4'] }));
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await submitAssignment('a1', 's1', {
      uploadedFile: { url: OWN_UPLOAD, originalName: 'clip.mp4' },
    });
    expect(uploadMock).not.toHaveBeenCalled();
    expect(r.fileUrl).toBe(OWN_UPLOAD);
    expect(r.fileName).toBe('clip.mp4');
  });

  it('rejects an uploaded file url that is not from our own storage', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowedTypes: ['mp4'] }));
    await expect(submitAssignment('a1', 's1', {
      uploadedFile: { url: 'https://evil.example/clip.mp4', originalName: 'clip.mp4' },
    })).rejects.toMatchObject({ status: 400 });
    await expect(submitAssignment('a1', 's1', {
      uploadedFile: { url: 'https://res.cloudinary.com/other-cloud/video/upload/submissions/clip.mp4', originalName: 'clip.mp4' },
    })).rejects.toMatchObject({ status: 400 });
    expect(p.submission.create).not.toHaveBeenCalled();
  });

  it('rejects an uploaded file whose stored extension is not allowed, whatever its name', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowedTypes: ['mp4'] }));
    await expect(submitAssignment('a1', 's1', {
      uploadedFile: { url: OWN_UPLOAD.replace('.mp4', '.exe'), originalName: 'clip.mp4' },
    })).rejects.toMatchObject({ status: 400 });
  });

  it('refuses a resubmission while its AI review is still running', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: 'dina' });
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', aiStatus: 'pending' });
    await expect(submitAssignment('a1', 's1', { repoName: 'my-repo' })).rejects.toMatchObject({ status: 409 });
    expect(p.submission.update).not.toHaveBeenCalled();
  });

  it('a resubmission clears the old AI review and the teacher approval', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: 'dina' });
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', aiStatus: 'done', fileUrl: 'old', fileName: 'old.pdf' });
    p.submission.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'sub1', ...data }));
    const r: any = await submitAssignment('a1', 's1', { repoName: 'my-repo' });
    expect(r).toMatchObject({ aiStatus: 'none', aiScore: null, aiApproved: false, fileUrl: null, fileName: null });
    expect(p.grade.upsert.mock.calls[0][0].update).toMatchObject({ contentApproved: false });
  });

  it('confirms a direct upload once the submission is saved', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    await submitAssignment('a1', 's1', { uploadedFile: { url: OWN_UPLOAD, originalName: 'clip.mp4' } });
    expect(confirmMock).toHaveBeenCalledWith(OWN_UPLOAD);
    expect(discardMock).not.toHaveBeenCalled();
  });

  it('removes a direct upload the server refused, so it does not stay in storage unseen', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowedTypes: ['pdf'] }));
    p.submission.findUnique.mockResolvedValue(null);
    await expect(submitAssignment('a1', 's1', { uploadedFile: { url: OWN_UPLOAD, originalName: 'clip.mp4' } }))
      .rejects.toMatchObject({ status: 400 });
    expect(discardMock).toHaveBeenCalledWith(OWN_UPLOAD, 's1');
    expect(confirmMock).not.toHaveBeenCalled();
  });

  it('removes a file it uploaded itself when saving the submission fails', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.submission.findUnique.mockResolvedValue(null);
    uploadMock.mockResolvedValue({ url: 'https://cdn/new.pdf', bytes: 1, resourceType: 'image', publicId: 'p' });
    destroyMock.mockResolvedValue(undefined);
    p.submission.create.mockRejectedValue(new Error('db down'));
    await expect(submitAssignment('a1', 's1', { file: { buffer: Buffer.from('x'), originalName: 'w.pdf', mimeType: 'application/pdf' } }))
      .rejects.toThrow('db down');
    expect(destroyMock).toHaveBeenCalledWith('https://cdn/new.pdf');
  });

  it('checks for a running AI review before uploading anything', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', aiStatus: 'pending' });
    await expect(submitAssignment('a1', 's1', { file: { buffer: Buffer.from('x'), originalName: 'w.pdf', mimeType: 'application/pdf' } }))
      .rejects.toMatchObject({ status: 409 });
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('releases the file a resubmission replaced', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ id: 's1', githubUsername: 'dina' });
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', aiStatus: 'done', fileUrl: 'https://cdn/old.pdf' });
    p.submission.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'sub1', ...data }));
    await submitAssignment('a1', 's1', { repoName: 'my-repo' });
    expect(releaseMock).toHaveBeenCalledWith(['https://cdn/old.pdf']);
  });

  it('keeps the stored file when a resubmission brings the same one', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', aiStatus: 'done', fileUrl: OWN_UPLOAD });
    p.submission.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'sub1', ...data }));
    await submitAssignment('a1', 's1', { uploadedFile: { url: OWN_UPLOAD, originalName: 'clip.mp4' } });
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('rejects an already-uploaded file whose extension is not allowed', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowedTypes: ['pdf'] }));
    await expect(submitAssignment('a1', 's1', {
      uploadedFile: { url: OWN_UPLOAD, originalName: 'clip.mp4' },
    })).rejects.toMatchObject({ status: 400 });
  });

  it('computes isLate=true when deadline is in the past', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ deadline: new Date('2000-01-01') }));
    p.user.findUnique.mockResolvedValue({ githubUsername: 'g' });
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await submitAssignment('a1', 's1', { repoName: 'r' });
    expect(r.isLate).toBe(true);
  });

  it('computes isLate=false when deadline is in the future', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ deadline: new Date('2999-01-01') }));
    p.user.findUnique.mockResolvedValue({ githubUsername: 'g' });
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockImplementation(({ data }: any) => Promise.resolve(data));
    const r: any = await submitAssignment('a1', 's1', { repoName: 'r' });
    expect(r.isLate).toBe(false);
  });

  it('resubmit updates the existing submission instead of creating', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    p.user.findUnique.mockResolvedValue({ githubUsername: 'g' });
    p.submission.findUnique.mockResolvedValue({ id: 'sub1' });
    p.submission.update.mockResolvedValue({ id: 'sub1', updated: true });
    await submitAssignment('a1', 's1', { repoName: 'r' });
    expect(p.submission.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'sub1' } }));
    expect(p.submission.create).not.toHaveBeenCalled();
  });
});

describe('submissions.service.getVideoUploadSignature', () => {
  it('throws 404 when the assignment does not exist', async () => {
    p.assignment.findUnique.mockResolvedValue(null);
    await expect(getVideoUploadSignature('a1', 's1')).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when the student has no lesson access', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    assertAccessMock.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));
    await expect(getVideoUploadSignature('a1', 's1')).rejects.toMatchObject({ status: 403 });
  });

  it('throws 400 when allowFile is false', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment({ allowFile: false }));
    await expect(getVideoUploadSignature('a1', 's1')).rejects.toMatchObject({ status: 400 });
    expect(signatureMock).not.toHaveBeenCalled();
  });

  it('returns signed params for the submissions folder', async () => {
    p.assignment.findUnique.mockResolvedValue(baseAssignment());
    signatureMock.mockReturnValue({ timestamp: 1, signature: 'sig', apiKey: 'k', cloudName: 'c', folder: 'submissions' });
    const r = await getVideoUploadSignature('a1', 's1');
    expect(signatureMock).toHaveBeenCalledWith('submissions', { uploaderId: 's1', allowedFormats: expect.arrayContaining(['mp4', 'mov']) });
    expect(r).toMatchObject({ signature: 'sig', folder: 'submissions' });
  });
});

describe('submissions.service.getMySubmissions', () => {
  it('splits assignments into pending (no submission) and submitted (with grade)', async () => {
    p.user.findUnique.mockResolvedValue({
      studentGroups: [{ groupId: 'g1' }],
      courseAccess: [], lessonAccess: [{ lessonId: 'l9' }],
    });
    p.assignment.findMany.mockResolvedValue([
      { id: 'a1', title: 'Pending one', deadline: new Date('2999-01-01'),
        lesson: { topic: 'T1', course: { name: 'C1' } }, submissions: [] },
      { id: 'a2', title: 'Done one', deadline: null,
        lesson: { topic: 'T2', course: { name: 'C2' } },
        submissions: [{ id: 'sub2', submittedAt: new Date(), isLate: false, notes: 'n', aiApproved: true }] },
    ]);
    p.grade.findUnique.mockResolvedValue({ submissionScore: 90, contentScore: 80, contentApproved: true, feedback: 'good', checklist: null });

    const r = await getMySubmissions('s1');
    expect(r.pending).toHaveLength(1);
    expect(r.pending[0].assignmentTitle).toBe('Pending one');
    expect(r.submitted).toHaveLength(1);
    expect(r.submitted[0].grade).toEqual({ submissionScore: 90, contentScore: 80, contentApproved: true, feedback: 'good', checklist: null });
  });

  it('always shows submissionScore but hides contentScore until the teacher approves it', async () => {
    p.user.findUnique.mockResolvedValue({ studentGroups: [], courseAccess: [], lessonAccess: [] });
    p.assignment.findMany.mockResolvedValue([
      { id: 'a2', title: 'Not approved', deadline: null,
        lesson: { topic: 'T', course: { name: 'C' } },
        submissions: [{ id: 'sub2', submittedAt: new Date(), isLate: false, notes: null, aiApproved: false }] },
    ]);
    p.grade.findUnique.mockResolvedValue({ submissionScore: 90, contentScore: 80, contentApproved: false, feedback: 'good', checklist: null });

    const r = await getMySubmissions('s1');
    expect(r.submitted[0].grade).toEqual({ submissionScore: 90, contentScore: null, contentApproved: false, feedback: 'good', checklist: null });
  });

  it('reveals contentScore once the teacher approves it', async () => {
    p.user.findUnique.mockResolvedValue({ studentGroups: [], courseAccess: [], lessonAccess: [] });
    p.assignment.findMany.mockResolvedValue([
      { id: 'a2', title: 'Approved', deadline: null,
        lesson: { topic: 'T', course: { name: 'C' } },
        submissions: [{ id: 'sub2', submittedAt: new Date(), isLate: false, notes: null, aiApproved: true }] },
    ]);
    p.grade.findUnique.mockResolvedValue({ submissionScore: 90, contentScore: 80, contentApproved: true, feedback: 'good', checklist: null });

    const r = await getMySubmissions('s1');
    expect(r.submitted[0].grade).toEqual({ submissionScore: 90, contentScore: 80, contentApproved: true, feedback: 'good', checklist: null });
  });

  it('submitted item has null grade when not graded yet', async () => {
    p.user.findUnique.mockResolvedValue({ studentGroups: [], courseAccess: [], lessonAccess: [] });
    p.assignment.findMany.mockResolvedValue([
      { id: 'a2', title: 'Ungraded', deadline: null,
        lesson: { topic: 'T', course: { name: 'C' } },
        submissions: [{ id: 'sub2', submittedAt: new Date(), isLate: true, notes: null }] },
    ]);
    p.grade.findUnique.mockResolvedValue(null);
    const r = await getMySubmissions('s1');
    expect(r.submitted[0].grade).toBeNull();
  });
});

describe('submissions.service.getSubmissionById', () => {
  it('throws 404 when not found', async () => {
    p.submission.findUnique.mockResolvedValue(null);
    await expect(getSubmissionById('x', 's1', 'STUDENT')).rejects.toMatchObject({ status: 404 });
  });

  it('throws 403 when a student requests another student\'s submission', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 'sub1', studentId: 'other' });
    await expect(getSubmissionById('sub1', 's1', 'STUDENT')).rejects.toMatchObject({ status: 403 });
  });

  it('allows ADMIN to read any submission', async () => {
    const sub = { id: 'sub1', studentId: 'other' };
    p.submission.findUnique.mockResolvedValue(sub);
    await expect(getSubmissionById('sub1', 'admin', 'ADMIN')).resolves.toMatchObject(sub);
  });

  it('allows the owning student', async () => {
    const sub = { id: 'sub1', studentId: 's1' };
    p.submission.findUnique.mockResolvedValue(sub);
    await expect(getSubmissionById('sub1', 's1', 'STUDENT')).resolves.toMatchObject({
      id: 'sub1', studentId: 's1',
    });
  });

  it('hides the AI score from the owning student until the teacher approves', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 's1', aiStatus: 'done', aiApproved: false,
      aiScore: 62, aiVerbalReview: 'summary', aiCodeReview: 'code notes',
    });
    const r: any = await getSubmissionById('sub1', 's1', 'STUDENT');
    expect(r.aiCodeReview).toBe('code notes'); // the review itself is hers right away
    expect(r.aiScore).toBeNull();
    expect(r.aiVerbalReview).toBeNull();
  });

  it('reveals the AI score to the student once approved', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 's1', aiStatus: 'done', aiApproved: true,
      aiScore: 62, aiVerbalReview: 'summary', aiCodeReview: 'code notes',
    });
    const r: any = await getSubmissionById('sub1', 's1', 'STUDENT');
    expect(r.aiScore).toBe(62);
    expect(r.aiVerbalReview).toBe('summary');
  });

  it('never strips anything for ADMIN', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 's1', aiStatus: 'done', aiApproved: false, aiScore: 62,
      grade: { submissionScore: 90, contentScore: 80 },
    });
    const r: any = await getSubmissionById('sub1', 'admin', 'ADMIN');
    expect(r.aiScore).toBe(62);
    expect(r.grade.contentScore).toBe(80);
  });

  it('hides the grade contentScore from the student until the teacher approves it', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 's1', aiStatus: 'done', aiApproved: false,
      grade: { submissionScore: 90, contentScore: 80, contentApproved: false },
    });
    const r: any = await getSubmissionById('sub1', 's1', 'STUDENT');
    expect(r.grade.submissionScore).toBe(90); // submission score is always hers
    expect(r.grade.contentScore).toBeNull();
  });

  it('reveals the grade contentScore to the student once approved', async () => {
    p.submission.findUnique.mockResolvedValue({
      id: 'sub1', studentId: 's1', aiStatus: 'done', aiApproved: true,
      grade: { submissionScore: 90, contentScore: 80, contentApproved: true },
    });
    const r: any = await getSubmissionById('sub1', 's1', 'STUDENT');
    expect(r.grade.contentScore).toBe(80);
  });
});

describe('submissions.service.importSubmissions', () => {
  it('reports a missing-data error for incomplete rows', async () => {
    const buf = await xlsxBuffer([['', 'a@x.com', 'repo']]);
    const r = await importSubmissions(buf);
    expect(r.imported).toBe(0);
    expect(r.errors.some((e) => e.includes('חסרים נתונים'))).toBe(true);
  });

  it('skips rows for unknown student / assignment', async () => {
    p.user.findUnique.mockResolvedValue(null);
    const buf = await xlsxBuffer([['Task1', 'ghost@x.com', 'repo']]);
    const r = await importSubmissions(buf);
    expect(r.skipped).toBe(1);
    expect(r.errors.some((e) => e.includes('לא נמצאה תלמידה'))).toBe(true);
  });

  it('creates a new submission with github url from username', async () => {
    p.user.findUnique.mockResolvedValue({ id: 's1', role: 'STUDENT', githubUsername: 'dina', studentGroups: [{ groupId: 'g1' }], courseAccess: [] });
    p.assignment.findMany.mockResolvedValue([{ id: 'a1', deadline: null, lesson: { course: { id: 'c1', groupId: 'g1' } } }]);
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockResolvedValue({});
    const buf = await xlsxBuffer([['Task1', 'a@x.com', 'repo']]);
    const r = await importSubmissions(buf);
    expect(r.imported).toBe(1);
    expect(p.submission.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ githubUrl: 'https://github.com/dina/repo' }),
    }));
  });

  it('updates when a submission already exists', async () => {
    p.user.findUnique.mockResolvedValue({ id: 's1', role: 'STUDENT', githubUsername: 'dina', studentGroups: [{ groupId: 'g1' }], courseAccess: [] });
    p.assignment.findMany.mockResolvedValue([{ id: 'a1', deadline: null, lesson: { course: { id: 'c1', groupId: 'g1' } } }]);
    p.submission.findUnique.mockResolvedValue({ id: 'sub1' });
    p.submission.update.mockResolvedValue({});
    const buf = await xlsxBuffer([['Task1', 'a@x.com', 'repo']]);
    const r = await importSubmissions(buf);
    expect(r.imported).toBe(1);
    expect(p.submission.update).toHaveBeenCalled();
    expect(p.submission.create).not.toHaveBeenCalled();
  });

  it('picks the same-titled assignment from the student own course', async () => {
    p.user.findUnique.mockResolvedValue({ id: 's1', role: 'STUDENT', githubUsername: 'dina', studentGroups: [{ groupId: 'g1' }], courseAccess: [] });
    p.assignment.findMany.mockResolvedValue([
      { id: 'other', deadline: null, lesson: { course: { id: 'c9', groupId: 'g9' } } },
      { id: 'mine', deadline: null, lesson: { course: { id: 'c1', groupId: 'g1' } } },
    ]);
    p.submission.findUnique.mockResolvedValue(null);
    p.submission.create.mockResolvedValue({});
    const r = await importSubmissions(await xlsxBuffer([['תרגיל 1', 'a@x.com', 'repo']]));
    expect(r.imported).toBe(1);
    expect(p.submission.create.mock.calls[0][0].data.assignmentId).toBe('mine');
  });

  it('refuses to guess between two same-titled assignments in her courses', async () => {
    p.user.findUnique.mockResolvedValue({ id: 's1', role: 'STUDENT', githubUsername: 'dina', studentGroups: [{ groupId: 'g1' }], courseAccess: [] });
    p.assignment.findMany.mockResolvedValue([
      { id: 'a1', deadline: null, lesson: { course: { id: 'c1', groupId: 'g1' } } },
      { id: 'a2', deadline: null, lesson: { course: { id: 'c2', groupId: 'g1' } } },
    ]);
    const r = await importSubmissions(await xlsxBuffer([['תרגיל 1', 'a@x.com', 'repo']]));
    expect(r.skipped).toBe(1);
    expect(r.errors[0]).toContain('כמה מטלות');
    expect(p.submission.create).not.toHaveBeenCalled();
  });

  it('skips a teacher account and a student outside the assignment course', async () => {
    p.user.findUnique.mockResolvedValueOnce({ id: 't1', role: 'ADMIN', studentGroups: [], courseAccess: [] });
    p.user.findUnique.mockResolvedValueOnce({ id: 's1', role: 'STUDENT', githubUsername: 'dina', studentGroups: [{ groupId: 'g1' }], courseAccess: [] });
    p.assignment.findMany.mockResolvedValue([{ id: 'a1', deadline: null, lesson: { course: { id: 'c9', groupId: 'g9' } } }]);
    const r = await importSubmissions(await xlsxBuffer([['T', 't@x.com', 'r'], ['T', 'a@x.com', 'r']]));
    expect(r.skipped).toBe(2);
    expect(r.errors[1]).toContain('אינה רשומה');
  });
});

describe('submissions.service rerunAiReview', () => {
  it('queues a teacher review and puts the submission back to pending, unapproved', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 's1', githubUrl: 'https://github.com/u/r', aiStatus: 'done', aiReviewCount: 3 });
    await rerunAiReview('s1');
    expect(p.submission.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { aiStatus: 'pending', aiApproved: false, aiError: null } });
    expect(aiQueueAdd).toHaveBeenCalledWith('review', { submissionId: 's1', byTeacher: true }, expect.any(Object));
  });

  it('refuses while a review is already running', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 's1', githubUrl: 'https://github.com/u/r', aiStatus: 'pending' });
    await expect(rerunAiReview('s1')).rejects.toMatchObject({ status: 400 });
    expect(aiQueueAdd).not.toHaveBeenCalled();
  });

  it('refuses a submission the AI cannot read', async () => {
    p.submission.findUnique.mockResolvedValue({ id: 's1', githubUrl: null, fileName: 'essay.pdf', aiStatus: null });
    await expect(rerunAiReview('s1')).rejects.toMatchObject({ status: 400 });
  });

  it('throws 404 for a missing submission', async () => {
    p.submission.findUnique.mockResolvedValue(null);
    await expect(rerunAiReview('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('submissions.service.requestAiReview', () => {
  const sub = (over: any = {}) => ({
    id: 'sub1', studentId: 's1', githubUrl: 'https://github.com/dina/a', fileUrl: null, fileName: null,
    aiStatus: 'none', aiReviewCount: 0, aiExtraAllowed: false, ...over,
  });

  it('claims the review with one conditional write and queues it', async () => {
    p.submission.findUnique.mockResolvedValue(sub());
    p.submission.updateMany.mockResolvedValue({ count: 1 });
    await requestAiReview('sub1', 's1');
    expect(p.submission.updateMany).toHaveBeenCalledWith({
      where: { id: 'sub1', aiStatus: { not: 'pending' }, aiReviewCount: { lt: 1 } },
      data: { aiStatus: 'pending', aiError: null },
    });
    expect(aiQueueAdd).toHaveBeenCalledTimes(1);
  });

  it('is a 409 and queues nothing when a parallel request won the race', async () => {
    p.submission.findUnique.mockResolvedValue(sub());
    p.submission.updateMany.mockResolvedValue({ count: 0 });
    await expect(requestAiReview('sub1', 's1')).rejects.toMatchObject({ status: 409 });
    expect(aiQueueAdd).not.toHaveBeenCalled();
  });

  it('is a 409 while a review is already pending', async () => {
    p.submission.findUnique.mockResolvedValue(sub({ aiStatus: 'pending' }));
    await expect(requestAiReview('sub1', 's1')).rejects.toMatchObject({ status: 409 });
    expect(p.submission.updateMany).not.toHaveBeenCalled();
  });
});
