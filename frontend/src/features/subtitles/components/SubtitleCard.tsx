import { memo, useEffect, useState } from 'react';
import { Copy, Check, Trash2, ArrowDownToLine } from 'lucide-react';
import type { SubtitleItem } from '../../../types';
import { useProcessingStore } from '../../../store/processingStore';
import { useVideoStore } from '../../../store/videoStore';
import { cn, formatTimeDisplay, trackColor, trackOf } from '../../../shared/lib';
import { useTranslation } from '../../../i18n';
import { useTrackLabel } from '../../../hooks/useTrackLabel';

interface Props {
  item: SubtitleItem;
  index: number;
  isActive: boolean;
  /** Another cue follows in the same track, so Merge is possible. */
  hasNext: boolean;
  showTrack: boolean;
  onHoverChange: (id: number | null) => void;
}

/**
 * Displays an individual subtitle item with editing, merging, and deletion capabilities.
 * Memoized: re-renders only when its own item or active state changes.
 */
export const SubtitleCard = memo(({ item, index, isActive, hasNext, showTrack, onHoverChange }: Props) => {
  const { t } = useTranslation();
  const label = useTrackLabel();
  const updateSubtitle = useProcessingStore((s) => s.updateSubtitle);
  const deleteSubtitle = useProcessingStore((s) => s.deleteSubtitle);
  const mergeSubtitles = useProcessingStore((s) => s.mergeSubtitles);
  const beginEdit = useProcessingStore((s) => s.beginEdit);
  const endEdit = useProcessingStore((s) => s.endEdit);
  const setCurrentFrame = useVideoStore((s) => s.setCurrentFrame);
  const setActiveTrack = useVideoStore((s) => s.setActiveTrack);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const isHighConf = item.conf > 0.85;
  const isLowConf = item.conf < 0.6;

  const handleJump = () => {
    const metadata = useVideoStore.getState().metadata;
    if (metadata) setCurrentFrame(Math.round(item.start * metadata.fps));
  };

  // Feedback on the button itself instead of a toast for a routine action.
  const handleCopy = () => {
    void navigator.clipboard.writeText(item.text).then(() => setCopied(true));
  };

  return (
    <div
      onMouseEnter={() => onHoverChange(item.id)}
      onMouseLeave={() => onHoverChange(null)}
      className={cn(
        "group relative flex flex-col gap-2 p-3 rounded-xl border transition-all duration-200",
        isActive ? "bg-bg-hover border-brand-500 shadow-[0_0_10px_rgba(0,122,204,0.15)]" : "bg-bg-panel border-border-main hover:border-border-strong",
        !isActive && item.isEdited ? "border-brand-500/40" : "",
        !isActive && !item.isEdited && isLowConf ? "border-red-500/30" : ""
      )}
    >
      <textarea
        value={item.text}
        onFocus={() => {
          beginEdit();
          setActiveTrack(trackOf(item));
        }}
        onBlur={endEdit}
        onChange={(e) => updateSubtitle(item.id, { text: e.target.value })}
        className="w-full bg-transparent text-[14px] text-txt-main resize-none focus:outline-none focus:ring-1 focus:ring-brand-500/50 rounded-md px-1 py-0.5 transition-colors leading-relaxed min-h-[48px] scrollbar-hide border border-transparent focus:border-brand-500/30"
        rows={2}
        spellCheck={false}
      />
      <div className="flex items-center justify-between text-xs mt-1 px-1">
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11px] font-bold text-txt-dim bg-bg-surface px-1.5 py-0.5 rounded-sm">
            #{index + 1}
          </span>
          {showTrack && (
            <span
              className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded max-w-[90px] truncate', trackColor(trackOf(item)).soft, trackColor(trackOf(item)).text)}
              title={label(trackOf(item))}
            >
              {label(trackOf(item))}
            </span>
          )}
          <button
            onClick={handleJump}
            className="font-mono text-[11px] text-txt-subtle hover:text-brand-500 transition-colors"
            title={t('subtitles.jumpTitle')}
          >
            {formatTimeDisplay(item.start)}
          </button>
          <span className={cn(
            "text-[10px] font-bold px-1.5 py-0.5 rounded tracking-wide",
            isHighConf ? "bg-green-500/10 text-green-400" :
            isLowConf ? "bg-red-500/10 text-red-400" : "bg-amber-500/10 text-amber-500"
          )}>
            {Math.round(item.conf * 100)}%
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasNext && (
            <button
              onClick={() => mergeSubtitles(item.id)}
              className="flex items-center gap-1.5 px-2 py-1 rounded bg-bg-surface hover:bg-brand-500 text-txt-muted hover:text-white transition-all text-[11px] font-bold uppercase tracking-wider shadow-sm opacity-50 group-hover:opacity-100"
              title={t('subtitles.mergeTitle')}
            >
              <ArrowDownToLine size={12} />
              {t('subtitles.merge')}
            </button>
          )}
          {item.isEdited && (
            <span className="text-[10px] font-bold uppercase bg-blue-500/10 text-brand-400 px-1.5 py-0.5 rounded border border-brand-500/20">
              {t('subtitles.edited')}
            </span>
          )}
        </div>
      </div>

      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 bg-bg-panel/90 backdrop-blur-md rounded-md p-1 border border-border-strong shadow-lg translate-y-[-4px] group-hover:translate-y-0">
        <button
          onClick={handleCopy}
          className={cn('p-1.5 rounded transition-colors', copied ? 'text-green-400' : 'text-txt-subtle hover:text-white hover:bg-white/10')}
          title={copied ? t('subtitles.copied') : t('subtitles.copyTitle')}
          aria-label={copied ? t('subtitles.copied') : t('subtitles.copyTitle')}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
        <button onClick={() => deleteSubtitle(item.id)} className="p-1.5 text-txt-subtle hover:text-red-400 hover:bg-red-500/10 rounded transition-colors" title={t('subtitles.deleteTitle')}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
});

SubtitleCard.displayName = 'SubtitleCard';
