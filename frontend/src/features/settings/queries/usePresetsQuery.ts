import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api';

export function usePresetsQuery() {
  return useQuery({
    queryKey: ['presets'],
    queryFn: () => api.getPresets(),
    staleTime: Infinity,
  });
}
