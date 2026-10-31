import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DownloadSubmissionsButton } from '@/components/lesson/DownloadSubmissionsButton';
import { ToastProvider } from '@/components/ui/toast';
import { renderWithProviders } from '../utils/render';

vi.mock('@/api/submissions.api', () => ({ submissionsApi: { downloadArchive: vi.fn() } }));
vi.mock('@/lib/utils', async (importOriginal) => ({ ...(await importOriginal<object>()), downloadBlob: vi.fn() }));
import { submissionsApi } from '@/api/submissions.api';
import { downloadBlob } from '@/lib/utils';

const downloadArchive = submissionsApi.downloadArchive as unknown as ReturnType<typeof vi.fn>;

function renderButton() {
  return renderWithProviders(
    <ToastProvider><DownloadSubmissionsButton assignmentId="a1" title="תרגיל useState" /></ToastProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('DownloadSubmissionsButton', () => {
  it('saves the archive under the assignment title', async () => {
    const blob = new Blob(['zip']);
    downloadArchive.mockResolvedValue({ data: blob });
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: /הורדת כל הקבצים/ }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(blob, 'תרגיל useState.zip'));
    expect(downloadArchive).toHaveBeenCalledWith('a1');
  });

  it("shows the server's message, read out of the error body, when there is nothing to download", async () => {
    const body = new Blob([JSON.stringify({ success: false, error: 'לא הוגשו קבצים למטלה הזו' })]);
    downloadArchive.mockRejectedValue({ response: { data: body } });
    renderButton();
    await userEvent.click(screen.getByRole('button', { name: /הורדת כל הקבצים/ }));
    expect(await screen.findByText('לא הוגשו קבצים למטלה הזו')).toBeInTheDocument();
    expect(downloadBlob).not.toHaveBeenCalled();
  });
});
