import React, { useEffect } from 'react';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { EditorPanel } from './features/editor/EditorPanel';
import { ResultsPanel } from './features/results/ResultsPanel';
import { ToastContainer } from './components/ui/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useVideoStore } from './store/videoStore';
import { useProcessingStore } from './store/processingStore';
import { useProcessingSocket } from './hooks/useProcessingSocket';

function App() {
  const initializeClientId = useVideoStore((s) => s.initializeClientId);
  const clientId = useVideoStore((s) => s.clientId);
  const file = useVideoStore((s) => s.file);
  const metadata = useVideoStore((s) => s.metadata);
  const undo = useProcessingStore((s) => s.undo);
  const redo = useProcessingStore((s) => s.redo);

  useEffect(() => {
    initializeClientId();
  }, [initializeClientId]);

  useProcessingSocket(clientId);

  const isProjectActive = !!file || !!metadata;

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
      <div className="h-1 w-full bg-brand-500 flex-shrink-0" />
      <div className="flex h-full p-4 gap-4">
        {isProjectActive && (
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
        {isProjectActive && (
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