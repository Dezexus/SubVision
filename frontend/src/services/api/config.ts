/**
 * Base configuration and environment variables for the API client.
 */
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:7860';
export const API_URL = `${API_BASE}/api`;
