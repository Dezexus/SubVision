/**
 * Utility to manage a persistent client identifier using localStorage.
 */
export const getClientId = (): string => {
  const key = 'subvision_client_id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : 'client_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return 'client_' + Math.random().toString(36).substring(2, 15);
  }
};

/**
 * Clears the stored client identifier from localStorage.
 */
export const resetClientId = (): void => {
  try {
    localStorage.removeItem('subvision_client_id');
  } catch {}
};