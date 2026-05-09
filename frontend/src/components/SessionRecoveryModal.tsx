import React, { useEffect, useState } from 'react';
import { getClientId } from '../utils/clientId';
import { useProcessingStore } from '../store/processingStore';
import { api } from '../services/api';

export const SessionRecoveryModal: React.FC = () => {
  const [activeJob, setActiveJob] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

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
    setLoading(true);
    const clientId = getClientId();
    try {
      await api.cancelSessionJob(activeJob, clientId);
    } catch (error) {
      console.error('Failed to cancel job:', error);
    } finally {
      setActiveJob(null);
      setLoading(false);
    }
  };

  if (loading || !activeJob) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white p-6 rounded-xl shadow-2xl max-w-md w-full">
        <h2 className="text-xl font-bold mb-4 text-gray-800">Обнаружен активный процесс</h2>
        <p className="mb-6 text-gray-600 leading-relaxed">
          На сервере уже обрабатывается ваше предыдущее видео. Хотите продолжить просмотр статуса или отменить его и начать новую задачу?
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={handleContinue} 
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Продолжить
          </button>
          <button 
            onClick={handleCancel} 
            className="flex-1 px-4 py-2 bg-red-100 text-red-700 font-medium rounded-lg hover:bg-red-200 transition-colors"
          >
            Отменить и начать заново
          </button>
        </div>
      </div>
    </div>
  );
};