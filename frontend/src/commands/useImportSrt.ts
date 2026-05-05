import { useCallback } from 'react';
import { api } from '../services/api';
import { useProcessingStore } from '../store/processingStore';
import { useUIStore } from '../store/uiStore';

export function useImportSrt() {
  const setSubtitles = useProcessingStore((s) => s.setSubtitles);
  const addLog = useProcessingStore((s) => s.addLog);
  const addToast = useUIStore((s) => s.addToast);

  const execute = useCallback(async (file: File) => {
    addLog(`Importing ${file.name}...`);
    try {
      const subs = await api.importSrt(file);
      setSubtitles(subs);
      addLog(`Imported ${subs.length} subtitles.`);
      addToast(`Imported ${subs.length} subtitles`, 'success');
    } catch (err: any) {
      const msg = err.response?.data?.detail || err.message || 'Import failed';
      addToast(msg, 'error');
      addLog(`Error importing SRT: ${msg}`);
      throw err;
    }
  }, [setSubtitles, addLog, addToast]);

  return { execute };
}