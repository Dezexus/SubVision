import React, { useEffect, useState, useCallback } from 'react';
import { Upload, AlertCircle, Loader2, Video, FileText, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../../utils/cn';
import { useUploadVideo } from '../../../commands/useUploadVideo';
import { useVideoStore } from '../../../store/videoStore';
import { api } from '../../../services/api';

export const WelcomeScreen = () => {
  const allowedExtensions = useVideoStore((s) => s.allowedExtensions);
  const setAllowedExtensions = useVideoStore((s) => s.setAllowedExtensions);
  const { execute, isLoading, progress } = useUploadVideo();
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const fetchExtensions = async () => {
      try {
        const data = await api.getAllowedExtensions();
        setAllowedExtensions(data);
      } catch (error) {
        console.error(error);
      }
    };
    if (allowedExtensions.length === 0) {
      fetchExtensions();
    }
  }, [allowedExtensions, setAllowedExtensions]);

  const exts = allowedExtensions.length > 0 ? allowedExtensions : ['.mp4', '.mkv', '.avi', '.mov', '.webm'];
  const acceptString = `video/*,${exts.join(',')}`;
  const displayExts = exts.map((e) => e.replace('.', '').toUpperCase()).join(', ');

  const handleFile = useCallback(async (file: File) => {
    setErrorMsg(null);
    try {
      await execute(file);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  }, [execute]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback(() => setIsDragging(false), []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } }
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8 bg-bg-deep relative"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="z-10 flex flex-col items-center w-full max-w-2xl"
      >
        <motion.div variants={itemVariants} className="text-center mb-8 space-y-2">
          <h1 className="text-3xl font-semibold text-txt-main tracking-tight">
            SubVision Workspace
          </h1>
          <p className="text-txt-subtle text-sm max-w-md mx-auto">
            Extract hardcoded subtitles, edit timings, or apply smart bounding box blur to your videos.
          </p>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className={cn(
            "w-full aspect-video rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all duration-200 relative overflow-hidden group cursor-pointer",
            isDragging
              ? "border-brand-500 bg-brand-500/5 scale-[1.01]"
              : "border-border-strong bg-bg-main hover:border-brand-500/50 hover:bg-bg-hover",
            errorMsg && "border-red-500/50 hover:border-red-500/50 bg-red-500/5"
          )}
        >
          <input
            type="file"
            accept={acceptString}
            className="hidden"
            id="central-upload"
            disabled={isLoading}
            onChange={onFileInputChange}
          />
          <label htmlFor="central-upload" className={cn(
            "flex flex-col items-center gap-5 w-full h-full justify-center absolute inset-0 cursor-pointer",
            isLoading && "cursor-wait"
          )}>
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center transition-transform duration-200",
              isLoading
                ? "bg-bg-panel"
                : "bg-bg-input group-hover:bg-brand-500 group-hover:text-white text-txt-muted shadow-sm group-hover:shadow-md group-hover:-translate-y-1"
            )}>
              {isLoading ? (
                <Loader2 size={28} className="animate-spin text-brand-500" />
              ) : (
                <Upload size={28} />
              )}
            </div>
            <div className="text-center space-y-1.5 px-4 relative z-10">
              <h2 className="text-lg font-medium text-txt-main">
                {isLoading ? (progress === 100 ? 'Processing...' : `Uploading ${progress}%...`) : 'Select or drop video'}
              </h2>
              <p className={cn("text-xs", isLoading ? "text-amber-500 animate-pulse font-medium" : "text-txt-subtle")}>
                {isLoading ? 'Analyzing file structure...' : displayExts}
              </p>
              {errorMsg && (
                <div className="flex items-center justify-center gap-1.5 text-red-400 text-xs mt-3 font-medium bg-red-500/10 py-1 px-3 rounded border border-red-500/20">
                  <AlertCircle size={14} />
                  {errorMsg}
                </div>
              )}
            </div>
          </label>
        </motion.div>

        <motion.div variants={itemVariants} className="flex gap-3 mt-8">
          {[
            { icon: <FileText size={14} />, text: 'AI OCR Extraction' },
            { icon: <Wand2 size={14} />, text: 'Smart Inpaint Blur' },
            { icon: <Video size={14} />, text: 'SRT Export' }
          ].map((badge, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-medium text-txt-muted bg-bg-panel border border-border-main px-3 py-1.5 rounded-md shadow-sm">
              <span className="text-brand-500">{badge.icon}</span>
              {badge.text}
            </div>
          ))}
        </motion.div>
      </motion.div>
    </div>
  );
};