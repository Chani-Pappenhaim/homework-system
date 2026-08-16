import type { AxiosResponse } from 'axios';
import type { ApiResponse } from '@/types';

/** Unwraps an axios response carrying the `{success, data}` envelope down to just `data`. */
export function unwrap<T>(res: AxiosResponse<ApiResponse<T>> | undefined): T | undefined {
  return res?.data?.data;
}
