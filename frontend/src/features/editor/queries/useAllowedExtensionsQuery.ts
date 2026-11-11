import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api';

/** Used until the backend list loads, or if it is unavailable. */
export const DEFAULT_VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];

/**
 * Allowed video extensions from the backend, falling back to the defaults.
 */
export const useVideoExtensions = (): string[] => {
  const { data } = useQuery<string[]>({
    queryKey: ['allowedExtensions'],
    queryFn: api.getAllowedExtensions,
    staleTime: Infinity,
  });
  return data && data.length > 0 ? data : DEFAULT_VIDEO_EXTENSIONS;
};

export const formatExtensions = (exts: string[]): string =>
  exts.map((e) => e.replace('.', '').toUpperCase()).join(', ');
