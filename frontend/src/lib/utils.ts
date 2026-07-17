import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(date));
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(date));
}

export function isOverdue(deadline: string | Date | null | undefined): boolean {
  if (!deadline) return false;
  return new Date(deadline) < new Date();
}

// Teachers often type "github.com/..." without a scheme. Without one the browser
// treats the href as a relative path and navigates inside the app instead of out.
export function toExternalUrl(url: string | null | undefined): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

export function formatBytes(bytes: number | bigint | null | undefined): string {
  if (!bytes) return '0 B';
  const n = Number(bytes);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
