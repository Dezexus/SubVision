import React, { useEffect, useState } from 'react';
import { getClientId } from '../utils/clientId';
import { useProcessingStore } from '../store/processingStore';
import { useVideoStore } from '../store/videoStore';
import { api } from '../services/api';
import { Button } from './ui/Button';

export const SessionRecoveryModal: React.FC = () => {
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  useEffect(() => {
    const checkStatus = async () => {
      const clientId = getClientId();
      if (!clientId) {
        setLoading(false);
        return;
      }
      
      try {
        const data = await api.getSessionStatus(clientId);
        if (data.has_active_job && data.job_id) {
          setActiveJob(data.job_id);
        }
      } catch (error) {
        console.error('Failed to check session status:', error);
      } finally {
        setLoading(false);
      }
    };
    checkStatus();
  }, []);

  const handleContinue = () => {
    if (activeJob) {
      const isOcr = activeJob.startsWith('ocr_');
      useProcessingStore.setState({
        activeOcrJobId: isOcr ? activeJob : null,
        activeBlurJobId: !isOcr ? activeJob : null,
        isProcessing: true,
        stoppedJobId: null
      });
    }
    setActiveJob(null);
  };

  const handleCancel = async () => {
    if (!activeJob) return;
    setIsCancelling(true);
    const clientId = getClientId();
    try {
      await api.cancelSessionJob(activeJob, clientId);
      useProcessingStore.getState().reset();
      useVideoStore.getState().reset();
    } catch (error) {
      console.error('Failed to cancel job:', error);
    } finally {
      setActiveJob(null);
      setIsCancelling(false);
      setLoading(false);
    }
  };

  if (loading || !activeJob) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-lg mx-4 overflow-hidden rounded-xl bg-bg-panel shadow-panel border border-border-main sm:mx-auto animate-in fade-in zoom-in-95 duration-200">
        
        <div className="absolute inset-x-0 top-0 h-1 bg-brand-500" />
        
        <div className="p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-bg-surface border border-border-strong shadow-sm">
              <svg className="h-6 w-6 text-brand-500 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-500"></span>
              </span>
            </div>
            <div className="pt-1">
              <h2 className="text-xl font-bold tracking-tight text-txt-main">Active Process Detected</h2>
              <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">Session Recovery</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-sm text-txt-muted leading-relaxed">
              A background task from your previous session is still running on the server. You can reconnect to monitor its progress or cancel it to start a new project.
            </p>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
            <Button 
              variant="secondary"
              onClick={handleCancel} 
              disabled={isCancelling}
              className="flex-1 py-3"
            >
              {isCancelling ? 'Stopping...' : 'Cancel Task'}
            </Button>
            <Button 
              variant="primary"
              onClick={handleContinue}
              disabled={isCancelling}
              className="flex-1 py-3"
            >
              Reconnect
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};