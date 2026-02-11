import React from 'react';
import { SettingsPanel } from './features/settings/SettingsPanel';
import { EditorPanel } from './features/editor/EditorPanel';
import { ResultsPanel } from './features/results/ResultsPanel';
import { useAppStore } from './store/useAppStore';

function App() {
  const { file } = useAppStore();

  return (
    <div className="w-full h-screen bg-bg-main flex flex-col text-txt-main overflow-hidden">
      {/* Header Line */}
      <div className="h-1 bg-brand-600 w-full" />

      <div className="flex h-full p-4 gap-4">
        {/* Left: Settings (Скрываем или блокируем, если нет файла, но лучше скрыть для чистоты) */}
        {file && <SettingsPanel />}

        {/* Center: Editor OR Upload Screen */}
        <EditorPanel />

        {/* Right: Results */}
        {file && <ResultsPanel />}
      </div>
    </div>
  );
}

export default App;
