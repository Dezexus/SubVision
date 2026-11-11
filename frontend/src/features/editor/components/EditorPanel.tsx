/**
 * Main editor panel managing the track switcher, video canvas, filter preview, and timeline.
 */
import { VideoCanvas } from './VideoCanvas';
import { FilterPreview } from './FilterPreview';
import { WelcomeScreen } from './WelcomeScreen';
import { Timeline } from '../../timeline';
import { PreviewMode } from './PreviewMode';
import { GlobalProgress } from '../../../components/GlobalProgress';
import { TrackSwitcher } from '../../../components/TrackSwitcher';
import { useVideoStore } from '../../../store/videoStore';
import { useGlobalKeydown } from '../../../shared/lib';

export const EditorPanel = () => {
  const file = useVideoStore((s) => s.file);
  const metadata = useVideoStore((s) => s.metadata);
  const isPreviewMode = useVideoStore((s) => s.isPreviewMode);
  const setCurrentFrame = useVideoStore((s) => s.setCurrentFrame);

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
    <div className="w-full h-full min-h-0 relative overflow-hidden flex flex-col gap-4">
      <GlobalProgress />
      <div className="shrink-0">
        <TrackSwitcher />
      </div>

      {isPreviewMode ? (
        <div className="flex-1 relative overflow-hidden">
          <PreviewMode />
        </div>
      ) : (
        <>
          <div className="flex-1 relative flex items-center justify-center overflow-hidden min-h-0">
            <VideoCanvas />
          </div>
          <div className="shrink-0 h-[126px] w-full">
            <FilterPreview />
          </div>
          <div className="shrink-0">
            <Timeline />
          </div>
        </>
      )}
    </div>
  );
};
