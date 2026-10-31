import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AssignmentFlags } from '@/components/lesson/AssignmentFlags';

describe('AssignmentFlags', () => {
  it('shows nothing for an ordinary assignment', () => {
    const { container } = render(<AssignmentFlags />);
    expect(container).toBeEmptyDOMElement();
  });

  it('badges a hidden assignment', () => {
    render(<AssignmentFlags hidden />);
    expect(screen.getByText('מוסתרת')).toBeInTheDocument();
    expect(screen.queryByText('רשות')).not.toBeInTheDocument();
  });

  it('badges an optional assignment, and both when it is both', () => {
    const { rerender } = render(<AssignmentFlags optional />);
    expect(screen.getByText('רשות')).toBeInTheDocument();
    expect(screen.queryByText('מוסתרת')).not.toBeInTheDocument();
    rerender(<AssignmentFlags hidden optional />);
    expect(screen.getByText('מוסתרת')).toBeInTheDocument();
    expect(screen.getByText('רשות')).toBeInTheDocument();
  });
});
