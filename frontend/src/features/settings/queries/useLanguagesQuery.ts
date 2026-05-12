import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import type { Language } from '../../../types';

/**
 * Hook to fetch and cache available OCR languages.
 */
export const useLanguagesQuery = () => {
  return useQuery<Language[]>({
    queryKey: ['languages'],
    queryFn: api.getLanguages,
    staleTime: Infinity,
  });
};