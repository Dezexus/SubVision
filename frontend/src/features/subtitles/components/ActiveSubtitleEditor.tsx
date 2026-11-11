import { Trash2 } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { useTranslation } from '../../../i18n';
import { useTrackLabel } from '../../../hooks/useTrackLabel';
import { cn, trackColor, trackOf } from '../../../shared/lib';

interface Props {
  /** Every cue on screen, one editor each. */
  cues: SubtitleItem[];
  showTrack: boolean;
  onChange: (id: number, text: string) => void;
  onFocus: (cue: SubtitleItem) => void;
  onBlur: () => void;
  onDelete: (id: number) => void;
}

/**
 * Editors for the cues on screen, stacked in a fixed-height box; the font
 * shrinks when several tracks show text at once.
 */
export const ActiveSubtitleEditor = ({ cues, showTrack, onChange, onFocus, onBlur, onDelete }: Props) => {
  const { t } = useTranslation();
  const label = useTrackLabel();

  if (cues.length === 0) {
    return (
      <div className="shrink-0 h-[126px] w-full bg-bg-main border border-border-main rounded-xl p-3 shadow-xl flex items-center justify-center text-txt-subtle transition-colors duration-300">
        <span className="text-xs font-medium tracking-wide italic opacity-50">{t('subtitles.noActive')}</span>
      </div>
    );
  }

  const compact = cues.length > 1;

  return (
    <div className="shrink-0 h-[126px] w-full bg-bg-main border border-border-main rounded-xl p-2 shadow-xl flex flex-col gap-1.5 transition-colors duration-300">
      {cues.map((cue) => {
        const color = trackColor(trackOf(cue));
        return (
          <div
            key={cue.id}
            className={cn(
              'flex-1 min-h-0 relative flex items-center group/editor rounded-lg',
              showTrack && cn('border-l-[3px] pl-2', color.border),
            )}
          >
            {showTrack && (
              <span className={cn('absolute left-3 top-1 text-[10px] font-bold uppercase tracking-wide', color.text)}>
                {label(trackOf(cue))}
              </span>
            )}
            <textarea
              value={cue.text}
              onChange={(e) => onChange(cue.id, e.target.value)}
              onFocus={() => onFocus(cue)}
              onBlur={onBlur}
              onKeyDown={(e) => e.stopPropagation()}
              className={cn(
                'w-full h-full bg-transparent border-none rounded-lg px-3 text-txt-main text-center resize-none focus:outline-none focus:bg-bg-surface/40 transition-colors scrollbar-hide',
                compact ? 'text-base pt-3' : 'text-2xl py-3',
              )}
              placeholder={t('subtitles.placeholder')}
              rows={1}
            />
            <button
              onClick={() => onDelete(cue.id)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-txt-subtle hover:text-white hover:bg-red-500/80 rounded-md opacity-0 group-hover/editor:opacity-100 transition-all z-10"
              title={t('subtitles.deleteTitle')}
            >
              <Trash2 size={compact ? 14 : 18} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
