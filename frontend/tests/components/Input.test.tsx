import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Input from '@/components/ui/Input';

describe('Input', () => {
  it('renders a label associated with the input', () => {
    render(<Input label="Email" />);
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('renders without a label', () => {
    render(<Input placeholder="no label" />);
    expect(screen.getByPlaceholderText('no label')).toBeInTheDocument();
  });

  it('reflects the value prop and fires onChange when typing', async () => {
    const onChange = vi.fn();
    render(<Input value="" onChange={onChange} placeholder="type here" />);
    await userEvent.type(screen.getByPlaceholderText('type here'), 'a');
    expect(onChange).toHaveBeenCalled();
  });

  it('shows an error message and applies the error border', () => {
    render(<Input error="Required" placeholder="p" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('p')).toHaveClass('border-red-400');
  });

  it('does not apply the error border when there is no error', () => {
    render(<Input placeholder="ok" />);
    expect(screen.getByPlaceholderText('ok')).not.toHaveClass('border-red-400');
  });

  it('forwards arbitrary input attributes such as type', () => {
    render(<Input type="password" placeholder="pw" />);
    expect(screen.getByPlaceholderText('pw')).toHaveAttribute('type', 'password');
  });

  it('forwards a ref to the input element', () => {
    const ref = { current: null as HTMLInputElement | null };
    render(<Input ref={ref} />);
    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });
});
