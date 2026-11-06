import { API_BASE } from '../api/config';

/** Trigger browser download for an API-relative or absolute URL. */
export function downloadFile(url: string, filename: string): void {
  const href = url.startsWith('http') ? url : `${API_BASE}${url}`;
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
