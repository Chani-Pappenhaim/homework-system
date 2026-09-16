import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('defaults to the muted variant', () => {
    render(<Badge>Gray</Badge>);
    expect(screen.getByText('Gray')).toHaveClass('bg-ground');
  });

  it.each([
    ['default', 'text-clay'],
    ['secondary', 'text-indigo'],
    ['success', 'text-sage'],
    ['warning', 'text-clay'],
    ['destructive', 'text-coral'],
  ] as const)('applies the %s variant class', (variant, cls) => {
    render(<Badge variant={variant}>{variant}</Badge>);
    expect(screen.getByText(variant)).toHaveClass(cls);
  });

  it('merges a custom className', () => {
    render(<Badge className="extra">X</Badge>);
    expect(screen.getByText('X')).toHaveClass('extra');
  });
});
