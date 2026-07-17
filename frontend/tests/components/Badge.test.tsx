import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Badge from '@/components/ui/Badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Hello</Badge>);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('defaults to the gray variant', () => {
    render(<Badge>Gray</Badge>);
    expect(screen.getByText('Gray')).toHaveClass('bg-[#EEEBF5]');
  });

  it.each([
    ['pink', 'text-[#E91E8C]'],
    ['violet', 'text-[#A78BFA]'],
    ['green', 'text-[#10B981]'],
    ['amber', 'text-[#F59E0B]'],
  ] as const)('applies the %s variant class', (variant, cls) => {
    render(<Badge variant={variant}>{variant}</Badge>);
    expect(screen.getByText(variant)).toHaveClass(cls);
  });

  it('merges a custom className', () => {
    render(<Badge className="extra">X</Badge>);
    expect(screen.getByText('X')).toHaveClass('extra');
  });
});
