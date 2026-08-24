/** Empty string = same-origin (Vite proxy in dev, nginx in Docker). */
export const API_BASE = import.meta.env.VITE_API_URL ?? '';

export const API_URL = API_BASE ? `${API_BASE}/api` : '/api';

/** WebSocket base URL derived from API_BASE or current page origin. */
export function getWsBase(): string {
  if (API_BASE) {
    return API_BASE.replace(/^http(s?):\/\//, 'ws$1://');
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}`;
}
