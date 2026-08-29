import React, { useEffect, useState } from 'react';

import { Download, Settings2, X } from 'lucide-react';

import { useMutation, useQuery } from '@tanstack/react-query';

import { Button } from '../../../shared/ui';

import { EmotionSettingsForm } from '../../admin/components/EmotionSettingsForm';

import { useEmotionExportStore } from '../../../store/emotionExportStore';

import { useVideoStore } from '../../../store/videoStore';

import { useProcessingStore } from '../../../store/processingStore';

import { useUIStore } from '../../../store/uiStore';

import { processApi } from '../../../shared/api/process';

import { getClientId } from '../../../shared/lib';

import { useTranslation } from '../../../i18n';

import type { EmotionAnalysisSettings } from '../../../types/emotion';

import { SpeakerProfilesEditor } from './SpeakerProfilesEditor';



interface Props {

  open: boolean;

  onClose: () => void;

}



export const EmotionExportDialog: React.FC<Props> = ({ open, onClose }) => {

  const [tab, setTab] = useState<'quick' | 'advanced'>('quick');

  const [saveLocal, setSaveLocal] = useState(false);

  const { t } = useTranslation();

  const metadata = useVideoStore((s) => s.metadata);

  const subtitles = useProcessingStore((s) => s.subtitles);

  const isProcessing = useProcessingStore((s) => s.isProcessing);

  const setProcessing = useProcessingStore((s) => s.setProcessing);

  const addToast = useUIStore((s) => s.addToast);



  const settings = useEmotionExportStore((s) => s.settings);

  const setExportSettings = useEmotionExportStore((s) => s.setExportSettings);

  const setDiarizationSettings = useEmotionExportStore((s) => s.setDiarizationSettings);

  const setJsonFormatSettings = useEmotionExportStore((s) => s.setJsonFormatSettings);

  const setGenderSettings = useEmotionExportStore((s) => s.setGenderSettings);

  const setTextSentimentSettings = useEmotionExportStore((s) => s.setTextSentimentSettings);

  const speakerProfileOverrides = useEmotionExportStore((s) => s.speakerProfileOverrides);

  const setSpeakerProfileOverride = useEmotionExportStore((s) => s.setSpeakerProfileOverride);

  const loadDefaults = useEmotionExportStore((s) => s.loadDefaults);

  const persistLocal = useEmotionExportStore((s) => s.persistLocal);

  const setActiveEmotionJobId = useEmotionExportStore((s) => s.setActiveEmotionJobId);



  const { data: serverDefaults } = useQuery({

    queryKey: ['emotionDefaults'],

    queryFn: () => processApi.getEmotionDefaults(),

    enabled: open,

  });



  useEffect(() => {

    if (serverDefaults) loadDefaults(serverDefaults);

  }, [serverDefaults, loadDefaults]);



  const exportMutation = useMutation({

    mutationFn: async () => {

      if (!metadata) throw new Error('No video');

      const clientId = getClientId();

      if (saveLocal) persistLocal();

      setProcessing(true);

      const profileKeys = Object.keys(speakerProfileOverrides);

      const profileOverrides = profileKeys.length > 0 ? speakerProfileOverrides : undefined;

      const res = await processApi.exportEmotion({

        filename: metadata.filename,

        original_filename: metadata.original_filename || metadata.filename,

        client_id: clientId,

        subtitles,

        emotion_settings: settings,

        speaker_profile_overrides: profileOverrides,

      });

      setActiveEmotionJobId(res.job_id);

      return res;

    },

    onSuccess: () => {

      addToast(t('emotion.queued'), 'info');

      onClose();

    },

    onError: (e: Error) => {

      setProcessing(false);

      addToast(e.message || t('emotion.exportFailed'), 'error');

    },

  });



  const handleChange = (

    section: 'export' | 'diarization' | 'gender' | 'text_sentiment' | 'json_format',

    key: string,

    value: boolean | number | string,

  ) => {

    if (section === 'export') setExportSettings({ [key]: value } as Partial<EmotionAnalysisSettings['export']>);

    else if (section === 'diarization') setDiarizationSettings({ [key]: value } as Partial<EmotionAnalysisSettings['diarization']>);

    else if (section === 'gender') setGenderSettings({ [key]: value } as Partial<EmotionAnalysisSettings['gender']>);

    else if (section === 'text_sentiment') setTextSentimentSettings({ [key]: value } as Partial<EmotionAnalysisSettings['text_sentiment']>);

    else setJsonFormatSettings({ [key]: value } as Partial<EmotionAnalysisSettings['json_format']>);

  };



  const showSpeakerSections = settings.export.analyze_speakers;

  const showSpeakerProfiles =

    showSpeakerSections

    && settings.gender.allow_manual_override;



  const advancedSections = showSpeakerSections

    ? (['export', 'diarization', 'gender', 'text_sentiment'] as const)

    : (['export', 'text_sentiment'] as const);



  if (!open) return null;



  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">

      <div className="w-full max-w-lg max-h-[min(90vh,640px)] bg-bg-panel border border-border-main rounded-xl shadow-panel flex flex-col overflow-hidden">

        <div className="flex items-center justify-between px-4 py-3 border-b border-border-main shrink-0">

          <h2 className="text-sm font-bold flex items-center gap-2">

            <Download size={16} className="text-brand-400" />

            {t('emotion.title')}

          </h2>

          <button type="button" onClick={onClose} className="text-txt-muted hover:text-txt-main">

            <X size={18} />

          </button>

        </div>



        <div className="px-4 pt-3 flex gap-2 shrink-0">

          <button

            type="button"

            className={`text-xs px-3 py-1 rounded ${tab === 'quick' ? 'bg-brand-500/20 text-brand-400' : 'text-txt-muted'}`}

            onClick={() => setTab('quick')}

          >

            {t('emotion.tabQuick')}

          </button>

          <button

            type="button"

            className={`text-xs px-3 py-1 rounded flex items-center gap-1 ${tab === 'advanced' ? 'bg-brand-500/20 text-brand-400' : 'text-txt-muted'}`}

            onClick={() => setTab('advanced')}

          >

            <Settings2 size={12} /> {t('emotion.tabAdvanced')}

          </button>

        </div>



        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 scrollbar-hide">

          {tab === 'quick' ? (

            <>

              <EmotionSettingsForm

                settings={settings}

                onChange={handleChange}

                sections={['export', 'text_sentiment']}

                quickOnly

              />

              {showSpeakerSections && (

                <EmotionSettingsForm

                  settings={settings}

                  onChange={handleChange}

                  sections={['gender']}

                  quickOnly

                />

              )}

              <p className="text-xs text-txt-subtle">{t('emotion.hintAudio')}</p>

            </>

          ) : (

            <>

              <EmotionSettingsForm

                settings={settings}

                onChange={handleChange}

                sections={[...advancedSections]}

                excludeQuick

                hideAdminOnly

                compact

              />

              {showSpeakerProfiles && (

                <SpeakerProfilesEditor

                  compact

                  maxSpeakers={settings.diarization.max_speakers}

                  overrides={speakerProfileOverrides}

                  onChange={setSpeakerProfileOverride}

                />

              )}

              {!showSpeakerSections && (

                <p className="text-[11px] text-txt-subtle">{t('emotion.advancedSpeakersHint')}</p>

              )}

            </>

          )}

        </div>



        <div className="px-4 py-2 border-t border-border-main shrink-0">

          <label className="flex items-center gap-2 text-xs text-txt-muted">

            <input type="checkbox" checked={saveLocal} onChange={(e) => setSaveLocal(e.target.checked)} />

            {t('emotion.saveDefaults')}

          </label>

        </div>



        <div className="p-4 border-t border-border-main flex gap-2 shrink-0">

          <Button variant="secondary" className="flex-1" onClick={onClose}>{t('common.cancel')}</Button>

          <Button

            variant="primary"

            className="flex-1"

            disabled={!metadata || subtitles.length === 0 || isProcessing || exportMutation.isPending}

            onClick={() => exportMutation.mutate()}

          >

            {exportMutation.isPending ? t('emotion.starting') : t('emotion.exportBtn')}

          </Button>

        </div>

      </div>

    </div>

  );

};

