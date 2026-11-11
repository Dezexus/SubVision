import { videoApi } from './video';
import { processApi } from './process';
import { API_BASE, API_URL, getWsBase } from './config';

export { API_BASE, API_URL, getWsBase };

export const api = {
  ...videoApi,
  ...processApi,
};