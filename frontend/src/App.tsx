import React, { useEffect } from 'react';
import { SettingsPanel } from './features/settings';
import { EditorPanel } from './features/editor';
import { ResultsPanel } from './features/results';
import { ToastContainer } from './shared/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SessionRecoveryModal } from './components/SessionRecoveryModal';
import { useVideoStore } from './store/videoStore';
import { useSubtitleStore } from './store/subtitleStore';
import { useProcessingSocket } from './hooks/useProcessingSocket';

/**
 * Main application component managing the layout, global state initialization, and shortcuts.
 */
function App() {
  const initializeClientId = useVideoStore((s) => s.initializeClientId);
  const clientId = useVideoStore((s) => s.clientId);
  const file = useVideoStore((s) => s.file);
  const filename = useVideoStore((s) => s.filename);
  const metadata = useVideoStore((s) => s.metadata);
  
  const undo = useSubtitleStore((s) => s.undo);
  const redo = useSubtitleStore((s) => s.redo);
  const restoreFromStorage = useSubtitleStore((s) => s.restoreFromStorage);
  
  const restoreVideoState = useVideoStore((s) => s.restoreVideoState);

  useEffect(() => {
    const id = initializeClientId();
    if (id) {
      restoreFromStorage();
      restoreVideoState();
    }
  }, [initializeClientId, restoreFromStorage, restoreVideoState]);

  useProcessingSocket(clientId);

  const isProjectLoaded = !!clientId && (!!file || !!metadata || !!filename);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
      }
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          if (e.shiftKey) redo();
          else {
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
      {clientId && <SessionRecoveryModal />}
      <div className="h-1 w-full bg-brand-500 flex-shrink-0" />
      <div className="flex h-full p-4 gap-4">
        {isProjectLoaded && (
          <div className="h-full z-20 flex-shrink-0">
            <ErrorBoundary>
              <SettingsPanel />
            </ErrorBoundary>
          </div>
        )}
        
        <div className="flex-1 h-full z-10 min-w-0">
          <ErrorBoundary>
            <EditorPanel />
          </ErrorBoundary>
        </div>

        {isProjectLoaded && (
          <div className="h-full z-20 flex-shrink-0 w-[420px] min-w-[380px]">
            <ErrorBoundary>
              <ResultsPanel />
            </ErrorBoundary>
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
  );
}

export default App;