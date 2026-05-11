/**
 * Renders the initial screen prompting the user to upload a video file to start a session.
 */
import React, { useRef } from 'react';
import { Upload, Video } from 'lucide-react';
import { useUploadVideo } from '../hooks/useUploadVideo';
import { useTaskStore } from '../../../store/taskStore';
import { Button } from '../../../components/ui/Button';

export const WelcomeScreen = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { execute: uploadVideo } = useUploadVideo();
  const isProcessing = useTaskStore((s) => s.isProcessing);
  const error = useTaskStore((s) => s.error);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      await uploadVideo(file);
    } catch (err) {
      console.error(err);
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in-95 duration-300">
      <div className="w-20 h-20 rounded-3xl bg-bg-surface border border-border-strong flex items-center justify-center mb-6 shadow-lg">
        <Video size={36} className="text-brand-500" />
      </div>
      <h2 className="text-2xl font-bold text-txt-main mb-2 tracking-tight">Welcome to SubVision</h2>
      <p className="text-sm text-txt-subtle max-w-[300px] leading-relaxed mb-8">
        Upload a video file to start editing subtitles or applying smart blur effects.
      </p>
      
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="video/*"
        className="hidden"
      />
      
      <Button
        variant="primary"
        className="py-3 px-8 text-sm font-bold tracking-wide shadow-xl"
        icon={<Upload size={18} />}
        onClick={() => fileInputRef.current?.click()}
        isLoading={isProcessing}
        disabled={isProcessing}
      >
        SELECT VIDEO
      </Button>

      {error && (
        <p className="mt-4 text-xs text-red-400 bg-red-500/10 px-3 py-1.5 rounded border border-red-500/20">
          {error}
        </p>
      )}
    </div>
  );
};