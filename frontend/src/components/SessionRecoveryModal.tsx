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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="relative w-full max-w-lg mx-4 overflow-hidden rounded-2xl bg-slate-900 shadow-[0_0_40px_-10px_rgba(0,0,0,0.7)] ring-1 ring-white/10 sm:mx-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Акцентная градиентная линия сверху */}
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        
        <div className="p-8">
          {/* Шапка модального окна */}
          <div className="mb-6 flex items-start gap-4">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
              <svg className="h-6 w-6 text-blue-400 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {/* Пульсирующая точка индикатора */}
              <span className="absolute -top-1 -right-1 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
              </span>
            </div>
            <div className="pt-1">
              <h2 className="text-xl font-bold tracking-tight text-white">Обнаружен активный процесс</h2>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-blue-400/90">Восстановление сеанса</p>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-sm text-slate-300 leading-relaxed">
              На сервере выполняется фоновая обработка вашего предыдущего видео. Вы можете подключиться к процессу, чтобы следить за прогрессом, либо прервать его и начать новую задачу.
            </p>
          </div>

          {/* Блок кнопок */}
          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4">
            <button 
              onClick={handleCancel} 
              disabled={isCancelling}
              className="group relative flex w-full justify-center items-center rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-3 text-sm font-medium text-slate-300 transition-all hover:bg-slate-800 hover:text-white hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:flex-1"
            >
              {isCancelling ? 'Остановка...' : 'Отменить всё'}
            </button>
            <button 
              onClick={handleContinue}
              disabled={isCancelling}
              className="group relative flex w-full justify-center items-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white transition-all hover:from-blue-500 hover:to-indigo-500 hover:shadow-[0_0_20px_rgba(79,70,229,0.3)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto sm:flex-1"
            >
              Подключиться
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};