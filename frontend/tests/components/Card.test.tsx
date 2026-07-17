import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Card, { CardHeader, CardBody } from '@/components/ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>content</Card>);
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('fires onClick', async () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>clickable</Card>);
    await userEvent.click(screen.getByText('clickable'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('applies the primary accent border', () => {
    render(<Card accent="primary">a</Card>);
    expect(screen.getByText('a')).toHaveClass('border-t-[#C2185B]');
  });

  it('applies the violet accent border', () => {
    render(<Card accent="violet">a</Card>);
    expect(screen.getByText('a')).toHaveClass('border-t-[#7C3AED]');
  });

  it('merges a custom className', () => {
    render(<Card className="mine">a</Card>);
    expect(screen.getByText('a')).toHaveClass('mine');
  });

  it('CardHeader renders children', () => {
    render(<CardHeader>head</CardHeader>);
    expect(screen.getByText('head')).toBeInTheDocument();
  });

  it('CardBody renders children', () => {
    render(<CardBody>body</CardBody>);
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
