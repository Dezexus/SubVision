/**
 * Real-time filter preview component enclosed in a monolithic container to eliminate CSS reflows and memory leaks.
 */
import React, { useEffect, useState } from 'react';
import { Cpu, Loader2, ScanLine } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';

const MAX_FILTER_CACHE = 30;
const filterCache = new Map<string, string>();

export const FilterPreview = () => {
  const { metadata, roi, config, currentFrameIndex } = useAppStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    filterCache.forEach(url => URL.revokeObjectURL(url));
    filterCache.clear();
  }, [metadata?.filename]);

  useEffect(() => {
    if (!metadata || roi[2] === 0) {
      setPreviewUrl(null);
      return;
    }

    let isActive = true;
    const cacheKey = `${metadata.filename}_${currentFrameIndex}_${roi.join(',')}_${config.scale_factor || 1.0}`;

    if (filterCache.has(cacheKey)) {
      const url = filterCache.get(cacheKey)!;
      filterCache.delete(cacheKey);
      filterCache.set(cacheKey, url);
      setPreviewUrl(url);
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = await api.getPreview({
          filename: metadata.filename,
          frame_index: currentFrameIndex,
          roi: roi,
          scale_factor: config.scale_factor || 1.0
        });

        if (isActive) {
          if (filterCache.size >= MAX_FILTER_CACHE) {
            const firstKey = filterCache.keys().next().value;
            if (firstKey) {
              const oldUrl = filterCache.get(firstKey);
              if (oldUrl) {
                URL.revokeObjectURL(oldUrl);
              }
              filterCache.delete(firstKey);
            }
          }
          filterCache.set(cacheKey, url);
          setPreviewUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }, 500);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [roi, config, currentFrameIndex, metadata]);

  if (!metadata) return null;

  return (
    <div className="w-full h-full bg-bg-main border border-border-main rounded-xl p-3 shadow-xl flex items-center overflow-hidden transition-colors duration-300">
      {!roi[2] ? (
        <div className="flex-1 flex flex-col items-center justify-center text-txt-subtle h-full border border-dashed border-border-strong rounded-lg bg-bg-panel/40">
          <ScanLine size={20} className="mb-2 opacity-50" />
          <span className="text-xs font-medium tracking-wide">
            Draw a selection box on the video to preview the algorithm
          </span>
        </div>
      ) : (
        <div className="flex gap-4 w-full h-full items-center">
          <div className="flex flex-col gap-2 w-[120px] shrink-0">
            <div className="flex items-center gap-2 text-txt-muted mb-1">
              <Cpu size={16} />
              <span className="text-xs font-bold uppercase tracking-wider">
                Algo Input
              </span>
            </div>
            <div className="space-y-1">
               <div className="flex justify-between text-[10px] text-txt-subtle uppercase">
                 <span>Scale</span>
                 <span className="text-txt-main font-mono">{config.scale_factor}x</span>
               </div>
               <div className="flex justify-between text-[10px] text-txt-subtle uppercase">
                 <span>ROI</span>
                 <span className="text-txt-main font-mono">{roi[2]}x{roi[3]}</span>
               </div>
            </div>
          </div>

          <div className="flex-1 bg-black rounded border border-border-main overflow-hidden flex items-center justify-center relative h-full">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <Loader2 className="animate-spin text-brand-500" size={20} />
              </div>
            )}
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Algorithm View"
                className="h-full w-auto object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-1 text-txt-subtle">
                <ScanLine size={16} />
                <span className="text-[9px]">NO SIGNAL</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
