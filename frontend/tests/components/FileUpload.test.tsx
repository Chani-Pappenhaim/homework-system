import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FileUpload } from '@/components/ui/file-upload';
import { PreviewableTypes } from '@/components/ui/previewable-types';

function getFileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('FileUpload', () => {
  it('renders the default label', () => {
    render(<FileUpload onFile={() => {}} />);
    expect(screen.getByText(/גרור קובץ/)).toBeInTheDocument();
  });

  it('renders a custom label', () => {
    render(<FileUpload onFile={() => {}} label="Upload here" />);
    expect(screen.getByText('Upload here')).toBeInTheDocument();
  });

  it('calls onFile when a file is selected via the input', async () => {
    // A picked file is staged first; onFile only fires once the upload is confirmed.
    const onFile = vi.fn();
    const { container } = render(<FileUpload onFile={onFile} />);
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await userEvent.upload(getFileInput(container), file);
    await userEvent.click(screen.getByText('העלה קובץ'));
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0]).toBe(file);
  });

  it('passes the accept attribute to the file input', () => {
    const { container } = render(<FileUpload onFile={() => {}} accept=".pdf" />);
    expect(getFileInput(container)).toHaveAttribute('accept', '.pdf');
  });

  it('calls onFile on drop', async () => {
    // A dropped file is staged first too; onFile only fires once the upload is confirmed.
    const onFile = vi.fn();
    const { container } = render(<FileUpload onFile={onFile} />);
    const dropzone = container.firstElementChild as HTMLElement;
    const file = new File(['x'], 'dropped.txt', { type: 'text/plain' });
    const dataTransfer = { files: [file] };
    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = dataTransfer;
    dropEvent.preventDefault = vi.fn();
    dropzone.dispatchEvent(dropEvent);
    await userEvent.click(await screen.findByText('העלה קובץ'));
    expect(onFile).toHaveBeenCalledWith(file, undefined);
  });

  describe('withName', () => {
    it('does not upload immediately; shows a name field prefilled without the extension', async () => {
      const onFile = vi.fn();
      const { container } = render(<FileUpload withName onFile={onFile} />);
      const file = new File(['hello'], 'my-report.pdf', { type: 'application/pdf' });
      await userEvent.upload(getFileInput(container), file);
      expect(onFile).not.toHaveBeenCalled();
      expect(screen.getByDisplayValue('my-report')).toBeInTheDocument();
    });

    it('uploads with the edited name once confirmed', async () => {
      const onFile = vi.fn();
      const { container } = render(<FileUpload withName onFile={onFile} />);
      const file = new File(['hello'], 'my-report.pdf', { type: 'application/pdf' });
      await userEvent.upload(getFileInput(container), file);
      const nameInput = screen.getByDisplayValue('my-report');
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, 'מצגת שיעור');
      await userEvent.click(screen.getByText('העלה קובץ'));
      expect(onFile).toHaveBeenCalledTimes(1);
      expect(onFile.mock.calls[0][0]).toBe(file);
      expect(onFile.mock.calls[0][1]).toBe('מצגת שיעור');
    });

    it('cancels the naming step without uploading', async () => {
      const onFile = vi.fn();
      const { container } = render(<FileUpload withName onFile={onFile} />);
      const file = new File(['hello'], 'my-report.pdf', { type: 'application/pdf' });
      await userEvent.upload(getFileInput(container), file);
      await userEvent.click(screen.getByText('ביטול'));
      expect(onFile).not.toHaveBeenCalled();
      expect(screen.queryByDisplayValue('my-report')).not.toBeInTheDocument();
    });
  });
});

describe('PreviewableTypes', () => {
  it('spells out a group on tap without opening the file picker around it', async () => {
    const { container } = render(<FileUpload onFile={() => {}} hint={<PreviewableTypes />} />);
    const clickPicker = vi.spyOn(getFileInput(container), 'click');
    const video = screen.getByRole('button', { name: /וידאו/ });
    expect(video).toHaveAttribute('title', 'mp4, webm, mov');

    await userEvent.click(video);
    expect(screen.getByRole('status')).toHaveTextContent('וידאו: mp4, webm, mov');
    expect(video).toHaveAttribute('aria-expanded', 'true');
    expect(clickPicker).not.toHaveBeenCalled();

    await userEvent.click(video);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText(/להורדה בלבד/)).toBeInTheDocument();
  });
});
