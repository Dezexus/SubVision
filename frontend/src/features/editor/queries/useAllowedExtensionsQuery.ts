import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api';

/**
 * Hook to fetch and cache allowed video extensions.
 */
export const useAllowedExtensionsQuery = () => {
  return useQuery<string[]>({
    queryKey: ['allowedExtensions'],
    queryFn: api.getAllowedExtensions,
    staleTime: Infinity,
  });
};