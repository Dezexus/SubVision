/**
 * Real-time filter preview component with memory leak prevention for blob URLs.
 */
import React, { useEffect, useState, useRef } from 'react';
import { Cpu, Loader2, ScanLine } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';

export const FilterPreview = () => {
  const { metadata, roi, config, currentFrameIndex } = useAppStore();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const currentUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!metadata || roi[2] === 0) {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
        currentUrlRef.current = null;
        setPreviewUrl(null);
      }
      return;
    }

    let isActive = true;

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const url = await api.getPreview({
          filename: metadata.filename,
          frame_index: currentFrameIndex,
          roi: roi,
          clahe_limit: config.clahe_limit || 2.0,
          scale_factor: config.scale_factor || 1.0,
          denoise: 3.0
        });

        if (isActive) {
          if (currentUrlRef.current) {
            URL.revokeObjectURL(currentUrlRef.current);
          }
          currentUrlRef.current = url;
          setPreviewUrl(url);
        } else {
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isActive) setLoading(false);
      }
    }, 500);

    return () => {
      isActive = false;
      clearTimeout(timer);
    };
  }, [roi, config, currentFrameIndex, metadata]);

  useEffect(() => {
    return () => {
      if (currentUrlRef.current) {
        URL.revokeObjectURL(currentUrlRef.current);
      }
    };
  }, []);

  if (!roi[2] || !metadata) return null;

  return (
    <div className="bg-[#1e1e1e] border border-[#333333] rounded-xl p-3 shadow-xl w-full flex gap-4 items-center">
      <div className="flex flex-col gap-2 min-w-[120px]">
        <div className="flex items-center gap-2 text-[#C5C5C5] mb-1">
          <Cpu size={16} />
          <span className="text-xs font-bold uppercase tracking-wider">
            Algo Input
          </span>
        </div>
        <div className="space-y-1">
           <div className="flex justify-between text-[10px] text-[#858585] uppercase">
             <span>Scale</span>
             <span className="text-[#F0F0F0] font-mono">{config.scale_factor}x</span>
           </div>
           <div className="flex justify-between text-[10px] text-[#858585] uppercase">
             <span>ROI</span>
             <span className="text-[#F0F0F0] font-mono">{roi[2]}x{roi[3]}</span>
           </div>
        </div>
      </div>

      <div className="flex-1 bg-black rounded border border-[#333333] overflow-hidden flex items-center justify-center relative h-[100px]">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
            <Loader2 className="animate-spin text-[#007acc]" size={20} />
          </div>
        )}
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Algorithm View"
            className="h-full w-auto object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-[#555]">
            <ScanLine size={16} />
            <span className="text-[9px]">NO SIGNAL</span>
          </div>
        )}
      </div>
    </div>
  );
};
