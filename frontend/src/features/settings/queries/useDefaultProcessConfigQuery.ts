import { useQuery } from '@tanstack/react-query';
import { api } from '../../../shared/api';
import type { OcrSettings } from '../../../types';

/**
 * Fetches default OCR process settings from the backend.
 */
export const useDefaultProcessConfigQuery = () => {
  return useQuery<OcrSettings>({
    queryKey: ['defaultProcessConfig'],
    queryFn: api.getDefaultProcessConfig,
    staleTime: Infinity,
  });
};
