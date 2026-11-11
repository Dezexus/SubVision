import { useVideoStore } from '../store/videoStore';
import { useTranslation, translate } from '../i18n';
import { trackLabel } from '../shared/lib';

/** Label of a track: its user name, or "Track N" in the current locale. */
export function useTrackLabel(): (track: number) => string {
  const { t } = useTranslation();
  const names = useVideoStore((s) => s.trackNames);
  return (track: number) => trackLabel(names, track, (n) => t('tracks.track', { n }));
}

/** Same outside React (export, toasts). */
export function getTrackLabel(track: number): string {
  return trackLabel(useVideoStore.getState().trackNames, track, (n) => translate('tracks.track', { n }));
}
