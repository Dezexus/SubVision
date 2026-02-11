import React, { useCallback, useState } from 'react';
import { Upload, FileVideo, X } from 'lucide-react';
import { useAppStore } from '../../../store/useAppStore';
import { cn } from '../../../utils/cn';
import { api } from '../../../services/api';

export const VideoUploader = () => {
  const { file, setFile, setMetadata, addLog } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const handleFile = useCallback(async (selectedFile: File) => {
    if (!selectedFile.type.startsWith('video/')) {
      alert('Please upload a video file');
      return;
    }

    setFile(selectedFile);
    setIsUploading(true);
    addLog(`Uploading: ${selectedFile.name}...`);

    try {
      const metadata = await api.uploadVideo(selectedFile);
      setMetadata(metadata);
      addLog(`Loaded: ${metadata.filename} (${metadata.total_frames} frames)`);
    } catch (error) {
      console.error(error);
      addLog('Error uploading video.');
      setFile(null as any); // Reset on error
    } finally {
      setIsUploading(false);
    }
  }, [setFile, setMetadata, addLog]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  if (file) {
    return (
      <div className="relative p-4 rounded-xl bg-glass-200 border border-brand-500/30 flex items-center gap-4 group">
        <div className="p-3 bg-brand-500/20 rounded-lg text-brand-400">
          <FileVideo size={24} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate text-sm text-gray-200">{file.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {isUploading ? 'Analyzing...' : `${(file.size / 1024 / 1024).toFixed(1)} MB`}
          </p>
        </div>
        <button
          onClick={() => setFile(null as any)}
          className="p-2 hover:bg-white/10 rounded-full transition text-gray-400 hover:text-white"
        >
          <X size={16} />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer flex flex-col items-center justify-center text-center group",
        isDragging
          ? "border-brand-500 bg-brand-500/10 scale-[1.02]"
          : "border-glass-border hover:border-brand-500/50 hover:bg-glass-100"
      )}
    >
      <input
        type="file"
        accept="video/*"
        className="hidden"
        id="video-upload"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <label htmlFor="video-upload" className="cursor-pointer w-full h-full flex flex-col items-center">
        <div className="p-4 rounded-full bg-glass-200 text-brand-400 mb-4 group-hover:scale-110 transition-transform duration-300">
          <Upload size={24} />
        </div>
        <p className="font-medium text-gray-300 group-hover:text-white transition">
          Click or Drag video
        </p>
        <p className="text-xs text-gray-500 mt-2">MP4, MKV, AVI</p>
      </label>
    </div>
  );
};
