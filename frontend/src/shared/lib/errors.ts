import axios from 'axios';

export function getApiErrorMessage(
  error: unknown,
  fallback: string,
  networkFallback?: string,
): string {
  if (axios.isAxiosError<{ detail?: unknown }>(error)) {
    if (networkFallback && error.code === 'ERR_NETWORK') return networkFallback;
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}
