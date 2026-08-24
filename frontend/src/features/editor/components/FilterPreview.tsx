import React, { useEffect, useState, useRef } from 'react';
import { Cpu, Loader2, ScanLine } from 'lucide-react';
import useWebSocket from 'react-use-websocket';
import { useVideoStore } from '../../../store/videoStore';
import { useConfigStore } from '../../../store/configStore';
import { getWsBase } from '../../../shared/api/config';

export const FilterPreview = () => {
  const metadata = useVideoStore((s) => s.metadata);
  const clientId = useVideoStore((s) => s.clientId);
  const roi = useVideoStore((s) => s.roi);
  const currentFrameIndex = useVideoStore((s) => s.currentFrameIndex);
  const config = useConfigStore((s) => s.config);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const throttleRef = useRef<number>(0);

  const { sendMessage, lastMessage, readyState } = useWebSocket(
    clientId ? `${getWsBase()}/api/video/ws/stream/${clientId}` : null,
    {
      shouldReconnect: () => true,
      reconnectAttempts: 10,
      reconnectInterval: 2000,
    }
  );

  useEffect(() => {
    if (lastMessage && lastMessage.data instanceof Blob) {
      const url = URL.createObjectURL(lastMessage.data);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setLoading(false);
    }
  }, [lastMessage]);

  useEffect(() => {
    if (!metadata || !roi?.[2]) {
      setPreviewUrl(null);
      return;
    }

    if (readyState !== 1) return;

    const scaleFactor = config.scale_factor || 1.0;
    const now = Date.now();
    const timeSinceLast = now - throttleRef.current;
    const delay = Math.max(0, 50 - timeSinceLast);

    const timer = setTimeout(() => {
      setLoading(true);
      throttleRef.current = Date.now();
      sendMessage(JSON.stringify({
        filename: metadata.filename,
        frame_index: currentFrameIndex,
        roi: roi,
        scale_factor: scaleFactor,
      }));
    }, delay);

    return () => clearTimeout(timer);
  }, [roi, config.scale_factor, currentFrameIndex, metadata, readyState, sendMessage]);

  if (!metadata) return null;

  return (
    <div className="w-full h-full bg-bg-main border border-border-main rounded-xl p-3 shadow-xl flex items-center overflow-hidden transition-colors duration-300">
      {!roi?.[2] ? (
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
              <span className="text-xs font-bold uppercase tracking-wider">Algo Input</span>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] text-txt-subtle uppercase">
                <span>Scale</span>
                <span className="text-txt-main font-mono">{config.scale_factor || 1.0}x</span>
              </div>
              <div className="flex justify-between text-[10px] text-txt-subtle uppercase">
                <span>ROI</span>
                <span className="text-txt-main font-mono">{roi?.[2]}x{roi?.[3]}</span>
              </div>
            </div>
          </div>

          <div className="flex-1 bg-black rounded border border-border-main overflow-hidden flex items-center justify-center relative h-full">
            {loading && !previewUrl && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                <Loader2 className="animate-spin text-brand-500" size={20} />
              </div>
            )}
            {previewUrl ? (
              <img src={previewUrl} alt="Algorithm View" className="h-full w-auto object-contain" />
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