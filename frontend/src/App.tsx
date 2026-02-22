/**
 * Root application component coordinating primary layout panels and global providers.
 */
import React from 'react';
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

  return (
    <div className="w-full h-screen bg-bg-main flex flex-col text-txt-main overflow-hidden">
      <div className="h-1 bg-brand-600 w-full" />

      <div className="flex h-full p-4 gap-4">
        {file && <SettingsPanel />}

        <EditorPanel />

        {file && <ResultsPanel />}
      </div>

      <PreviewModal />
      <ToastContainer />
    </div>
  );
}

export default App;
