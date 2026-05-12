import { videoApi } from './video';
import { processApi } from './process';
import { API_BASE } from './config';

export { API_BASE };

export const api = {
  ...videoApi,
  ...processApi,
};