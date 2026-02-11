import React, { useCallback, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { api } from '../../../services/api';
import { cn } from '../../../utils/cn';

export const WelcomeScreen = () => {
  const { setFile, setMetadata, addLog } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleFile = useCallback(async (selectedFile: File) => {
    setErrorMsg(null);

    // ИСПРАВЛЕНИЕ: Добавлен .mov в список
    const validExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
    const hasValidExt = validExtensions.some(ext => selectedFile.name.toLowerCase().endsWith(ext));

    // Некоторые браузеры не определяют MIME type для MKV/MOV, поэтому проверяем и по расширению
    const isVideoType = selectedFile.type.startsWith('video/');

    if (!isVideoType && !hasValidExt) {
      setErrorMsg('Invalid file type. Please upload MP4, MKV, AVI or MOV.');
      return;
    }

    setIsUploading(true);
    addLog(`Uploading: ${selectedFile.name}...`);

    try {
      const metadata = await api.uploadVideo(selectedFile);
      setMetadata(metadata);
      setFile(selectedFile);
    } catch (error: any) {
      console.error(error);
      // Если сервер не отвечает (Network Error), выводим понятное сообщение
      const msg = error.code === "ERR_NETWORK"
        ? "Server is offline. Please start the backend."
        : (error.response?.data?.detail || 'Failed to process video.');

      setErrorMsg(msg);
      addLog(`Error: ${msg}`);
    } finally {
      setIsUploading(false);
    }
  }, [setFile, setMetadata, addLog]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8"
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <div className={cn(
        "max-w-2xl w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all duration-300 relative",
        isDragging
          ? "border-brand-500 bg-brand-500/5 scale-[1.02]"
          : "border-glass-border bg-bg-surface hover:bg-bg-hover",
        errorMsg ? "border-red-500/50" : ""
      )}>
        <input
          type="file"
          // ИСПРАВЛЕНИЕ: Добавлен .mov в input accept
          accept="video/*,.mkv,.avi,.mov"
          className="hidden"
          id="central-upload"
          disabled={isUploading}
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />

        <label htmlFor="central-upload" className={cn(
            "cursor-pointer flex flex-col items-center gap-6 w-full h-full justify-center",
            isUploading && "cursor-wait opacity-80"
        )}>
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform",
             isUploading ? "bg-bg-panel animate-pulse" : "bg-bg-panel group-hover:scale-110"
          )}>
            <Upload size={32} className={cn("transition-colors", isUploading ? "text-brand-400" : "text-brand-500")} />
          </div>

          <div className="text-center space-y-2 px-4">
            <h2 className="text-2xl font-semibold text-txt-main">
              {isUploading ? 'Uploading & Analyzing...' : 'Drop Video Here'}
            </h2>
            <p className="text-txt-muted text-sm">
              {isUploading ? 'Please wait...' : 'MP4, MKV, AVI, MOV'}
            </p>
            {errorMsg && (
                <div className="flex items-center justify-center gap-2 text-red-400 text-sm mt-2 font-medium bg-red-500/10 py-1 px-3 rounded">
                    <AlertCircle size={14} />
                    {errorMsg}
                </div>
            )}
          </div>
        </label>
      </div>
    </div>
  );
};
