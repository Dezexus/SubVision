/**
 * Root application component coordinating primary layout and global hotkeys.
 */
import React, { useEffect } from 'react';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { EditorPanel } from './features/editor/EditorPanel';
import { ResultsPanel } from './features/results/ResultsPanel';
import { PreviewModal } from './features/preview/PreviewModal';
import { ToastContainer } from './components/ui/ToastContainer';
import { useAppStore } from './store/useAppStore';
import { useSocket } from './hooks/useSocket';

function App() {
  useSocket();
  const file = useAppStore((state) => state.file);
  const undo = useAppStore((state) => state.undo);
  const redo = useAppStore((state) => state.redo);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Let the browser handle native text undo inside inputs/textareas
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          if (e.shiftKey) {
            e.preventDefault();
            redo();
          } else {
            e.preventDefault();
            undo();
          }
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="w-full h-screen bg-bg-main flex flex-col text-txt-main overflow-hidden">
      <div className="h-1 w-full bg-brand-500 flex-shrink-0" />

      <div className="flex h-full p-4 gap-4">
        {file && (
          <div className="h-full z-20">
            <SettingsPanel />
          </div>
        )}

        <div className="flex-1 h-full z-10 min-w-0">
          <EditorPanel />
        </div>

        {file && (
          <div className="h-full z-20">
            <ResultsPanel />
          </div>
        )}
      </div>

      <PreviewModal />
      <ToastContainer />
    </div>
  );
}

export default App;
