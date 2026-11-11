import { useEffect, useRef } from 'react';
import { SettingsPanel } from './features/settings';
import { EditorPanel } from './features/editor';
import { ResultsPanel } from './features/results';
import { ResizeHandle, ToastContainer } from './shared/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SessionRecoveryModal } from './components/SessionRecoveryModal';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { useVideoStore } from './store/videoStore';
import { useProcessingStore } from './store/processingStore';
import { PANEL_LIMITS, useLayoutStore, type Side } from './store/layoutStore';
import { useWorkspaceMode } from './store/workspace';
import { useProcessingSocket } from './hooks/useProcessingSocket';
import { useGlobalKeydown } from './shared/lib';
import { useTranslation } from './i18n';

/**
 * Main application component.
 */
function App() {
  const { t } = useTranslation();
  const initializeClientId = useVideoStore((s) => s.initializeClientId);
  const clientId = useVideoStore((s) => s.clientId);
  const file = useVideoStore((s) => s.file);
  const filename = useVideoStore((s) => s.filename);
  const metadata = useVideoStore((s) => s.metadata);

  const undo = useProcessingStore((s) => s.undo);
  const redo = useProcessingStore((s) => s.redo);
  const restoreFromStorage = useProcessingStore((s) => s.restoreFromStorage);

  const restoreVideoState = useVideoStore((s) => s.restoreVideoState);

  const mode = useWorkspaceMode();
  const leftWidth = useLayoutStore((s) => s.leftWidth);
  const rightWidth = useLayoutStore((s) => s.rightWidth);
  const leftCollapsed = useLayoutStore((s) => s.leftCollapsed);
  const rightCollapsed = useLayoutStore((s) => s.rightCollapsed);
  const setWidth = useLayoutStore((s) => s.setWidth);
  const dragBase = useRef(0);

  useEffect(() => {
    const id = initializeClientId();
    if (id) {
      restoreFromStorage();
      restoreVideoState();
    }
  }, [initializeClientId, restoreFromStorage, restoreVideoState]);

  useProcessingSocket(clientId);

  const isProjectLoaded = !!clientId && (!!file || !!metadata || !!filename);
  // Editing uses the player; the settings column only matters for OCR and removal.
  const showLeft = isProjectLoaded && mode !== 'edit';

  useGlobalKeydown((e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (key === 'y') {
      e.preventDefault();
      redo();
    }
  });

  const resizeProps = (side: Side) => ({
    onResizeStart: () => {
      dragBase.current = useLayoutStore.getState()[side === 'left' ? 'leftWidth' : 'rightWidth'];
    },
    // The right panel grows when the handle moves left.
    onResize: (delta: number) => setWidth(side, dragBase.current + (side === 'left' ? delta : -delta)),
    label: t('layout.resizePanel'),
  });

  return (
    <div className="w-full h-screen bg-bg-main flex flex-col text-txt-main overflow-hidden">
      {clientId && <SessionRecoveryModal />}
      <div className="h-1 w-full bg-brand-500 flex-shrink-0" />
      {isProjectLoaded && (
        <div className="flex justify-end px-4 pt-2 flex-shrink-0">
          <LanguageSwitcher />
        </div>
      )}
      <div className="flex flex-1 min-h-0 p-4 overflow-hidden">
        {showLeft && (
          <>
            <aside
              className="h-full min-h-0 z-20 flex-shrink-0"
              style={{ width: leftCollapsed ? PANEL_LIMITS.left.collapsed : leftWidth }}
            >
              <ErrorBoundary>
                <SettingsPanel />
              </ErrorBoundary>
            </aside>
            {leftCollapsed ? <div className="w-4 shrink-0" /> : <ResizeHandle orientation="vertical" className="mx-1" {...resizeProps('left')} />}
          </>
        )}

        <main className="flex-1 min-h-0 min-w-0 z-10 overflow-hidden">
          <ErrorBoundary>
            <EditorPanel />
          </ErrorBoundary>
        </main>

        {isProjectLoaded && (
          <>
            {rightCollapsed ? <div className="w-4 shrink-0" /> : <ResizeHandle orientation="vertical" className="mx-1" {...resizeProps('right')} />}
            <aside
              className="h-full min-h-0 z-20 flex-shrink-0"
              style={{ width: rightCollapsed ? PANEL_LIMITS.right.collapsed : rightWidth }}
            >
              <ErrorBoundary>
                <ResultsPanel />
              </ErrorBoundary>
            </aside>
          </>
        )}
      </div>
      <ToastContainer />
    </div>
  );
}

export default App;
