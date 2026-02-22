/**
 * Unified API export combining video and processing modules.
 */
import { videoApi } from './api/video';
import { processApi } from './api/process';
import { API_BASE } from './api/config';

export { API_BASE };

export const api = {
  ...videoApi,
  ...processApi,
};
