import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

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
    expect(screen.getByText('a')).toHaveClass('border-t-primary');
  });

  it('applies the secondary accent border', () => {
    render(<Card accent="secondary">a</Card>);
    expect(screen.getByText('a')).toHaveClass('border-t-secondary');
  });

  it('merges a custom className', () => {
    render(<Card className="mine">a</Card>);
    expect(screen.getByText('a')).toHaveClass('mine');
  });

  it('CardHeader renders children', () => {
    render(<CardHeader>head</CardHeader>);
    expect(screen.getByText('head')).toBeInTheDocument();
  });

  it('CardContent renders children', () => {
    render(<CardContent>body</CardContent>);
    expect(screen.getByText('body')).toBeInTheDocument();
  });
});
