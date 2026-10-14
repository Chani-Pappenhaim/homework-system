import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useConfirm } from '@/components/ui/use-confirm';

function Harness({ onResult }: { onResult: (ok: boolean) => void }) {
  const [confirmDialog, ask] = useConfirm();
  return (
    <div>
      <button onClick={async () => onResult(await ask({ title: 'למחוק את הקובץ?', description: 'אין דרך חזרה.' }))}>מחק</button>
      {confirmDialog}
    </div>
  );
}

describe('useConfirm', () => {
  it('shows the styled dialog instead of the browser confirm and resolves true on confirm', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: 'מחק' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('למחוק את הקובץ?');
    expect(screen.getByText('אין דרך חזרה.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'מחיקה' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(nativeConfirm).not.toHaveBeenCalled();
  });

  it('resolves false on cancel', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: 'מחק' }));
    await userEvent.click(screen.getByRole('button', { name: 'ביטול' }));
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
  });

  it('resolves false when closed with Escape', async () => {
    const onResult = vi.fn();
    render(<Harness onResult={onResult} />);
    await userEvent.click(screen.getByRole('button', { name: 'מחק' }));
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(onResult).toHaveBeenCalledWith(false));
    expect(onResult).toHaveBeenCalledTimes(1);
  });
});
