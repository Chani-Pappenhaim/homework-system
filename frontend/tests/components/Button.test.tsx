import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Button from '@/components/ui/Button';

describe('Button', () => {
  it('renders its children', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument();
  });

  it('fires onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Go</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled when disabled prop is set and does not fire onClick', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Nope</Button>);
    const btn = screen.getByRole('button', { name: 'Nope' });
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('is disabled and shows a spinner while loading', () => {
    const { container } = render(<Button loading>Saving</Button>);
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled();
    expect(container.querySelector('svg.animate-spin')).toBeInTheDocument();
  });

  it('applies primary variant classes by default', () => {
    render(<Button>Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('gradient-primary');
  });

  it('applies the danger variant classes', () => {
    render(<Button variant="danger">Delete</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-red-500');
  });

  it('applies the violet variant classes', () => {
    render(<Button variant="violet">V</Button>);
    expect(screen.getByRole('button')).toHaveClass('bg-[#7C3AED]');
  });

  it('applies size classes', () => {
    render(<Button size="lg">Big</Button>);
    expect(screen.getByRole('button')).toHaveClass('px-6');
  });

  it('merges a custom className', () => {
    render(<Button className="my-custom">X</Button>);
    expect(screen.getByRole('button')).toHaveClass('my-custom');
  });

  it('sets the button type attribute', () => {
    render(<Button type="submit">Submit</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'submit');
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>R</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
