import { videoApi } from './video';
import { processApi } from './process';
import { adminApi } from './admin';
import { API_BASE, API_URL, getWsBase } from './config';

export { API_BASE, API_URL, getWsBase, adminApi };

export const api = {
  ...videoApi,
  ...processApi,
  admin: adminApi,
};