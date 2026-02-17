// The root component of the application, responsible for the main layout.
import React from 'react';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { EditorPanel } from './features/editor/EditorPanel';
import { ResultsPanel } from './features/results/ResultsPanel';
import { useAppStore } from './store/useAppStore';

function App() {
  const { file } = useAppStore();

  return (
    <div className="w-full h-screen bg-bg-main flex flex-col text-txt-main overflow-hidden">
      {/* A simple brand-colored top border */}
      <div className="h-1 bg-brand-600 w-full" />

      <div className="flex h-full p-4 gap-4">
        {/* Left: Settings Panel (hidden until a file is loaded) */}
        {file && <SettingsPanel />}

        {/* Center: Main Editor or Welcome Screen */}
        <EditorPanel />

        {/* Right: Results Panel (hidden until a file is loaded) */}
        {file && <ResultsPanel />}
      </div>
    </div>
  );
}

export default App;
