/**
 * Initial screen displayed for file uploading.
 * Redesigned with Framer Motion animations and Glassmorphism UI.
 */
import React from 'react';
import { Upload, AlertCircle, Loader2, Video, Sparkles, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';
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

  // Animation variants for staggered entrance
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
  };

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-8 relative overflow-hidden"
      {...dragHandlers}
    >
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-brand-500/10 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="z-10 flex flex-col items-center w-full max-w-2xl"
      >
        {/* Header / Hero Section */}
        <motion.div variants={itemVariants} className="text-center mb-8 space-y-3">
          <div className="inline-flex items-center justify-center p-3 bg-brand-500/10 rounded-2xl mb-2 border border-brand-500/20 shadow-[0_0_15px_rgba(0,122,204,0.1)]">
            <Video size={28} className="text-brand-400" />
          </div>
          <h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-txt-muted tracking-tight">
            SubVision Workspace
          </h1>
          <p className="text-txt-subtle text-sm max-w-md mx-auto">
            Upload your video to extract hardcoded subtitles, edit them, or intelligently blur them out.
          </p>
        </motion.div>

        {/* Dropzone Container */}
        <motion.div
          variants={itemVariants}
          whileHover={!isUploading ? { scale: 1.02 } : {}}
          whileTap={!isUploading ? { scale: 0.98 } : {}}
          className={cn(
            "w-full aspect-video rounded-3xl border-2 border-dashed flex flex-col items-center justify-center transition-colors duration-300 relative overflow-hidden group shadow-2xl cursor-pointer",
            isDragging
              ? "border-brand-400 bg-brand-500/10 shadow-[0_0_50px_rgba(0,122,204,0.2)]"
              : "border-border-strong bg-bg-panel/40 backdrop-blur-sm hover:border-brand-500/50 hover:bg-bg-panel/60",
            errorMsg && "border-red-500/50 hover:border-red-500/50"
          )}
        >
          <input
            type="file"
            accept="video/*,.mkv,.avi,.mov,.webm"
            className="hidden"
            id="central-upload"
            disabled={isUploading}
            onChange={onFileInputChange}
          />

          <label htmlFor="central-upload" className={cn(
              "flex flex-col items-center gap-6 w-full h-full justify-center absolute inset-0 cursor-pointer",
              isUploading && "cursor-wait"
          )}>
            {/* Glow behind the icon */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-brand-500/20 blur-2xl rounded-full group-hover:bg-brand-500/30 transition-colors" />

            {/* Icon Circle */}
            <div className={cn(
              "relative z-10 w-20 h-20 rounded-full flex items-center justify-center shadow-xl transition-all duration-300",
               isUploading
                ? "bg-bg-surface"
                : "bg-gradient-to-b from-brand-500 to-brand-600 group-hover:shadow-[0_0_30px_rgba(0,122,204,0.4)] text-white"
            )}>
              {isConverting ? (
                  <Loader2 size={32} className="animate-spin text-amber-400" />
              ) : isUploading ? (
                  <Loader2 size={32} className="animate-spin text-brand-400" />
              ) : (
                  <Upload size={32} className="transform group-hover:-translate-y-1 transition-transform" />
              )}
            </div>

            {/* Text Information */}
            <div className="text-center space-y-2 px-4 relative z-10">
              <h2 className={cn("text-2xl font-semibold", isUploading ? "text-txt-main" : "text-white")}>
                {isUploading ? (uploadProgress === 100 ? 'Processing...' : `Uploading ${uploadProgress}%...`) : 'Drag & Drop Video'}
              </h2>
              <p className={cn("text-sm font-medium", isConverting ? "text-amber-400 animate-pulse" : "text-txt-subtle")}>
                {isUploading ? (isConverting ? 'Converting unsupported codec to H.264...' : 'Please wait, analyzing file...') : 'MP4, MKV, AVI, MOV, WEBM'}
              </p>
              {errorMsg && (
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center justify-center gap-2 text-red-400 text-sm mt-3 font-medium bg-red-500/10 py-1.5 px-4 rounded-lg border border-red-500/20"
                >
                    <AlertCircle size={16} />
                    {errorMsg}
                </motion.div>
              )}
            </div>
          </label>
        </motion.div>

        {/* Feature Badges Overview */}
        <motion.div variants={itemVariants} className="flex gap-4 mt-8">
          {[
            { icon: <Sparkles size={14} />, text: 'AI OCR Detection' },
            { icon: <Wand2 size={14} />, text: 'Smart Inpaint Blur' },
            { icon: <Video size={14} />, text: 'SRT Export' }
          ].map((badge, i) => (
            <div key={i} className="flex items-center gap-2 text-xs font-medium text-txt-muted bg-bg-panel border border-border-main px-3 py-1.5 rounded-full shadow-sm">
              <span className="text-brand-400">{badge.icon}</span>
              {badge.text}
            </div>
          ))}
        </motion.div>

      </motion.div>
    </div>
  );
};
