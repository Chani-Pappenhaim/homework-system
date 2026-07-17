import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FileUpload from '@/components/ui/FileUpload';

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
    const onFile = vi.fn();
    const { container } = render(<FileUpload onFile={onFile} />);
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    await userEvent.upload(getFileInput(container), file);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect(onFile.mock.calls[0][0]).toBe(file);
  });

  it('passes the accept attribute to the file input', () => {
    const { container } = render(<FileUpload onFile={() => {}} accept=".pdf" />);
    expect(getFileInput(container)).toHaveAttribute('accept', '.pdf');
  });

  it('calls onFile on drop', () => {
    const onFile = vi.fn();
    const { container } = render(<FileUpload onFile={onFile} />);
    const dropzone = container.firstElementChild as HTMLElement;
    const file = new File(['x'], 'dropped.txt', { type: 'text/plain' });
    const dataTransfer = { files: [file] };
    const dropEvent = new Event('drop', { bubbles: true }) as any;
    dropEvent.dataTransfer = dataTransfer;
    dropEvent.preventDefault = vi.fn();
    dropzone.dispatchEvent(dropEvent);
    expect(onFile).toHaveBeenCalledWith(file);
  });
});
