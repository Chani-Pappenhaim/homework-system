import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useSyncedForm } from '@/hooks/useSyncedForm';

type Course = { name: string };

function setup(initial: Course | null, key?: unknown) {
  return renderHook(
    ({ source, resetKey }: { source: Course | null; resetKey?: unknown }) => {
      const [name, setName] = useState('');
      useSyncedForm(source, (c) => ({ name: c.name }), { name }, (v) => setName(v.name), resetKey);
      return { name, setName };
    },
    { initialProps: { source: initial, resetKey: key } },
  );
}

describe('useSyncedForm', () => {
  it('fills the form when the data first arrives', () => {
    const { result, rerender } = setup(null);
    expect(result.current.name).toBe('');
    rerender({ source: { name: 'א' }, resetKey: undefined });
    expect(result.current.name).toBe('א');
  });

  it('takes a change from outside when she has not touched the form', () => {
    const { result, rerender } = setup({ name: 'א' });
    rerender({ source: { name: 'ב' }, resetKey: undefined });
    expect(result.current.name).toBe('ב');
  });

  it('keeps what she typed when the data changes under her', () => {
    const { result, rerender } = setup({ name: 'א' });
    act(() => result.current.setName('הקלדה שלי'));
    rerender({ source: { name: 'ב' }, resetKey: undefined });
    expect(result.current.name).toBe('הקלדה שלי');
  });

  it('follows the data again after she saved (the form matches the new data)', () => {
    const { result, rerender } = setup({ name: 'א' });
    act(() => result.current.setName('ב'));
    rerender({ source: { name: 'ב' }, resetKey: undefined });
    rerender({ source: { name: 'ג' }, resetKey: undefined });
    expect(result.current.name).toBe('ג');
  });

  it('refills even a touched form when the reset key changes', () => {
    const { result, rerender } = setup({ name: 'א' }, 's1');
    act(() => result.current.setName('הקלדה שלי'));
    rerender({ source: { name: 'ב' }, resetKey: 's2' });
    expect(result.current.name).toBe('ב');
  });
});
