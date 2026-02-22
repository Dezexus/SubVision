/**
 * Initial screen displayed for file uploading.
 */
import React from 'react';
import { Upload, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { useVideoUpload } from '../hooks/useVideoUpload';

export const WelcomeScreen = () => {
  const {
    isDragging,
    isUploading,
    uploadProgress,
    errorMsg,
    isConverting,
    dragHandlers,
    onFileInputChange
  } = useVideoUpload();

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8"
      {...dragHandlers}
    >
      <div className={cn(
        "max-w-2xl w-full aspect-video rounded-2xl border-2 border-dashed flex flex-col items-center justify-center transition-all duration-300 relative",
        isDragging
          ? "border-brand-500 bg-brand-500/5 scale-[1.02]"
          : "border-border-strong bg-bg-surface hover:bg-bg-hover",
        errorMsg && "border-red-500/50"
      )}>
        <input
          type="file"
          accept="video/*,.mkv,.avi,.mov,.webm"
          className="hidden"
          id="central-upload"
          disabled={isUploading}
          onChange={onFileInputChange}
        />

        <label htmlFor="central-upload" className={cn(
            "cursor-pointer flex flex-col items-center gap-6 w-full h-full justify-center",
            isUploading && "cursor-wait opacity-80"
        )}>
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-transform",
             isUploading ? "bg-bg-panel" : "bg-bg-panel group-hover:scale-110"
          )}>
            {isConverting ? (
                <Loader2 size={32} className="animate-spin text-amber-500" />
            ) : (
                <Upload size={32} className={cn("transition-colors", isUploading ? "text-brand-400" : "text-brand-500")} />
            )}
          </div>

          <div className="text-center space-y-2 px-4">
            <h2 className="text-2xl font-semibold text-txt-main">
              {isUploading ? (uploadProgress === 100 ? 'Processing...' : `Uploading ${uploadProgress}%...`) : 'Drop Video Here'}
            </h2>
            <p className={cn("text-sm", isConverting ? "text-amber-400 font-medium animate-pulse" : "text-txt-muted")}>
              {isUploading ? (isConverting ? 'Converting unsupported codec to H.264. This may take a while...' : 'Please wait, analyzing file...') : 'MP4, MKV, AVI, MOV, WEBM'}
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
