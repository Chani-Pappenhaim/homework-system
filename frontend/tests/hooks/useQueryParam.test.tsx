import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { useQueryParam, useQueryParams } from '@/hooks/useQueryParam';

function wrapperAt(url: string) {
  return ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={[url]}>{children}</MemoryRouter>;
}

describe('useQueryParam', () => {
  it('reads the value from the address, and is empty when the parameter is absent', () => {
    const { result } = renderHook(() => [useQueryParam('q')[0], useQueryParam('group')[0]], { wrapper: wrapperAt('/x?q=%D7%93%D7%A0%D7%94') });
    expect(result.current).toEqual(['דנה', '']);
  });

  it('writes the value into the address in place of the current entry, keeping the other parameters', () => {
    const { result } = renderHook(() => ({ q: useQueryParam('q'), loc: useLocation(), nav: useNavigationType() }), { wrapper: wrapperAt('/x?tab=files') });
    act(() => result.current.q[1]('דנה'));
    expect(result.current.q[0]).toBe('דנה');
    expect(new URLSearchParams(result.current.loc.search).get('tab')).toBe('files');
    expect(result.current.nav).toBe('REPLACE');
  });

  it('leaves no parameter behind when the value is cleared', () => {
    const { result } = renderHook(() => ({ q: useQueryParam('q'), loc: useLocation() }), { wrapper: wrapperAt('/x?q=a') });
    act(() => result.current.q[1](''));
    expect(result.current.loc.search).toBe('');
  });
});

describe('useQueryParams', () => {
  it('sets several values in one step without one overwriting another', () => {
    const { result } = renderHook(() => ({ p: useQueryParams(), loc: useLocation() }), { wrapper: wrapperAt('/x?groupId=g1&studentId=s1') });
    act(() => result.current.p[1]({ groupId: 'g2', studentId: '', courseId: 'c1' }));
    const params = new URLSearchParams(result.current.loc.search);
    expect(params.get('groupId')).toBe('g2');
    expect(params.get('courseId')).toBe('c1');
    expect(params.has('studentId')).toBe(false);
  });
});
