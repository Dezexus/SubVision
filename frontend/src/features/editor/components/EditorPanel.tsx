/**
 * Center column: stage tabs, track switcher, then the stage's own view.
 */
import { ChevronDown, ChevronUp, Cpu } from 'lucide-react';
import { VideoCanvas } from './VideoCanvas';
import { FilterPreview } from './FilterPreview';
import { WelcomeScreen } from './WelcomeScreen';
import { Timeline } from '../../timeline';
import { PreviewMode } from './PreviewMode';
import { GlobalProgress } from '../../../components/GlobalProgress';
import { TrackSwitcher } from '../../../components/TrackSwitcher';
import { WorkspaceTabs } from '../../../components/WorkspaceTabs';
import { NewProjectButton } from '../../../components/NewProjectButton';
import { useVideoStore } from '../../../store/videoStore';
import { useLayoutStore } from '../../../store/layoutStore';
import { useWorkspaceMode } from '../../../store/workspace';
import { useGlobalKeydown } from '../../../shared/lib';
import { useTranslation } from '../../../i18n';

const AlgoPreview = () => {
  const { t } = useTranslation();
  const open = useLayoutStore((s) => s.algoPreviewOpen);
  const toggle = useLayoutStore((s) => s.toggleAlgoPreview);

  if (!open) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-expanded={false}
        className="shrink-0 w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border-main bg-bg-main text-xs text-txt-subtle hover:text-txt-main hover:bg-bg-hover transition-colors"
      >
        <Cpu size={14} aria-hidden />
        {t('preview.show')}
        <ChevronDown size={14} className="ml-auto" aria-hidden />
      </button>
    );
  }

  return (
    <div className="shrink-0 h-[126px] w-full relative">
      <FilterPreview />
      <button
        type="button"
        onClick={toggle}
        aria-expanded
        title={t('preview.hide')}
        aria-label={t('preview.hide')}
        className="absolute top-2 right-2 z-10 p-1 rounded-md text-txt-subtle hover:text-txt-main hover:bg-bg-hover transition-colors"
      >
        <ChevronUp size={14} />
      </button>
    </div>
  );
};

export const EditorPanel = () => {
  const file = useVideoStore((s) => s.file);
  const metadata = useVideoStore((s) => s.metadata);
  const setCurrentFrame = useVideoStore((s) => s.setCurrentFrame);
  const mode = useWorkspaceMode();

  useGlobalKeydown((e) => {
    if (e.code === 'ArrowLeft') {
      e.preventDefault();
      setCurrentFrame((f) => Math.max(0, f - 1));
    } else if (e.code === 'ArrowRight' && metadata) {
      e.preventDefault();
      setCurrentFrame((f) => Math.min(metadata.total_frames - 1, f + 1));
    }
  });

  if (!file && !metadata) {
    return (
      <div className="w-full h-full border border-border-main rounded-xl bg-bg-deep overflow-hidden shadow-2xl flex items-center justify-center">
        <WelcomeScreen />
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-0 relative flex flex-col gap-3">
      <GlobalProgress />
      <div className="shrink-0 flex items-start gap-3 flex-wrap">
        <WorkspaceTabs />
        <div className="flex-1 min-w-0">
          <TrackSwitcher />
        </div>
        <NewProjectButton />
      </div>

      {mode === 'edit' ? (
        <div className="flex-1 min-h-0 relative overflow-hidden">
          <PreviewMode />
        </div>
      ) : (
        <>
          <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
            <VideoCanvas />
          </div>
          {mode === 'ocr' && <AlgoPreview />}
          <div className="shrink-0">
            <Timeline />
          </div>
        </>
      )}
    </div>
  );
};
