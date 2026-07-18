import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('renders a label associated with the input', () => {
    // Regression: the label used to be plain markup with no htmlFor, so it was
    // findable by text but never actually tied to the field.
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeInstanceOf(HTMLInputElement);
  });

  it('gives each input a distinct id so labels do not collide', () => {
    render(
      <>
        <Input label="First" />
        <Input label="Second" />
      </>
    );
    expect(screen.getByLabelText('First')).not.toBe(screen.getByLabelText('Second'));
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

  it('shows an error message and marks the field invalid', () => {
    render(<Input error="Required" placeholder="p" />);
    const field = screen.getByPlaceholderText('p');
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(field).toHaveClass('border-destructive');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    // The message is announced with the field rather than sitting beside it.
    expect(field).toHaveAccessibleDescription('Required');
  });

  it('does not apply the error border when there is no error', () => {
    render(<Input placeholder="ok" />);
    const field = screen.getByPlaceholderText('ok');
    expect(field).not.toHaveClass('border-destructive');
    expect(field).not.toHaveAttribute('aria-invalid');
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
