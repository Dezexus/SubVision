import React, { useEffect, useState } from 'react';
import { getClientId } from '../utils/clientId';
import { useProcessingStore } from '../store/processingStore';
import { useVideoStore } from '../store/videoStore';
import { api } from '../services/api';

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
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 backdrop-blur-md">
      <div className="bg-white p-8 rounded-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)] max-w-lg w-full mx-4 border border-slate-100">
        
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
            <svg className="h-6 w-6 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-20"></span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">Активный процесс</h2>
            <p className="text-sm font-medium text-blue-600">Найдена незавершенная задача</p>
          </div>
        </div>

        <p className="mb-8 text-slate-600 leading-relaxed">
          На сервере уже обрабатывается ваше предыдущее видео. Вы можете подключиться к процессу, чтобы следить за статусом, либо отменить его и запустить новую задачу.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={handleCancel} 
            disabled={isCancelling}
            className="flex-1 inline-flex justify-center items-center px-4 py-2.5 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCancelling ? 'Отмена...' : 'Остановить задачу'}
          </button>
          <button 
            onClick={handleContinue}
            disabled={isCancelling}
            className="flex-1 inline-flex justify-center items-center px-4 py-2.5 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow-sm shadow-blue-600/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Подключиться
          </button>
        </div>
      </div>
    </div>
  );
};