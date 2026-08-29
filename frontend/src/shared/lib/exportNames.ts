/** Base name for export files (no extension), safe for download. */
export function exportStem(originalFilename: string | undefined, storageFilename: string): string {
  const candidate = (originalFilename?.trim() || storageFilename);
  const base = candidate.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '');
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ]+/g, '_').replace(/_+/g, '_').replace(/^[._ ]+|[._ ]+$/g, '');
  return (cleaned.slice(0, 200) || 'export');
}

export function exportWithSuffix(stem: string, suffix: string): string {
  const sfx = suffix.startsWith('_') || suffix.startsWith('.') ? suffix : `_${suffix}`;
  const full = `${stem}${sfx}`;
  const cleaned = full.replace(/[^a-zA-Z0-9._\- ]+/g, '_').replace(/_+/g, '_').replace(/^[._ ]+|[._ ]+$/g, '');
  return cleaned.slice(0, 255) || `export${sfx}`;
}
