import React, { useEffect } from 'react';
import { SettingsPanel } from './features/settings';
import { EditorPanel } from './features/editor';
import { ResultsPanel } from './features/results';
import { ToastContainer } from './shared/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SessionRecoveryModal } from './components/SessionRecoveryModal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useVideoStore } from './store/videoStore';
import { useProcessingStore } from './store/processingStore';
import { useProcessingSocket } from './hooks/useProcessingSocket';

/**
 * Main application component.
 */
function App() {
  const initializeClientId = useVideoStore((s) => s.initializeClientId);
  const clientId = useVideoStore((s) => s.clientId);
  const file = useVideoStore((s) => s.file);
  const filename = useVideoStore((s) => s.filename);
  const metadata = useVideoStore((s) => s.metadata);
  
  const undo = useProcessingStore((s) => s.undo);
  const redo = useProcessingStore((s) => s.redo);
  const restoreFromStorage = useProcessingStore((s) => s.restoreFromStorage);
  
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
      {isProjectLoaded && (
        <div className="flex justify-end px-4 pt-2 flex-shrink-0">
          <LanguageSwitcher />
        </div>
      )}
      <div className="flex flex-1 min-h-0 p-4 gap-4 overflow-hidden">
        {isProjectLoaded && (
          <div className="h-full min-h-0 z-20 flex-shrink-0">
            <ErrorBoundary>
              <SettingsPanel />
            </ErrorBoundary>
          </div>
        )}
        
        <div className="flex-1 min-h-0 min-w-0 z-10 overflow-hidden">
          <ErrorBoundary>
            <EditorPanel />
          </ErrorBoundary>
        </div>

        {isProjectLoaded && (
          <div className="h-full min-h-0 z-20 flex-shrink-0 w-[420px] min-w-[380px]">
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