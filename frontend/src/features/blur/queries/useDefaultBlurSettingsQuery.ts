import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import type { BlurSettings } from '../../../types';

/**
 * Hook to fetch and cache the default blur settings from the server.
 */
export const useDefaultBlurSettingsQuery = () => {
  return useQuery<BlurSettings>({
    queryKey: ['defaultBlurSettings'],
    queryFn: api.getDefaultBlurSettings,
    staleTime: Infinity,
  });
};