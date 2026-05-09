/**
 * Utility to manage a persistent client identifier using localStorage.
 */
export const getClientId = (): string => {
  const key = 'subvision_client_id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
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