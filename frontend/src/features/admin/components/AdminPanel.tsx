import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../../shared/api/admin';
import { GlassPanel } from '../../../shared/ui';
import { LanguageSwitcher } from '../../../components/LanguageSwitcher';
import { EmotionSettingsForm } from './EmotionSettingsForm';
import { AdminLayout } from './AdminLayout';
import { AdminSystemPanel } from './AdminSystemPanel';
import { AdminJobsTable } from './AdminJobsTable';
import { useTranslation } from '../../../i18n';
import { useUIStore } from '../../../store/uiStore';
import type { EmotionAnalysisSettings } from '../../../types/emotion';
import type { AdminTab } from './AdminTabs';
import type { SettingFieldMeta } from '../emotionSettingsMeta';

const ADMIN_KEY_STORAGE = 'subvision_admin_key';

type Section = SettingFieldMeta['section'];

function settingsEqual(a: EmotionAnalysisSettings, b: EmotionAnalysisSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export const AdminGate: React.FC<{ children: (adminKey: string) => React.ReactNode }> = ({ children }) => {
  const { t } = useTranslation();
  const [key, setKey] = useState(() => sessionStorage.getItem(ADMIN_KEY_STORAGE) ?? '');
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  const tryAuth = async () => {
    try {
      await adminApi.getStatus(input);
      sessionStorage.setItem(ADMIN_KEY_STORAGE, input);
      setKey(input);
      setError('');
    } catch {
      setError(t('admin.loginError'));
    }
  };

  if (!key) {
    return (
      <div className="min-h-screen bg-bg-main flex items-center justify-center p-4">
        <GlassPanel className="w-full max-w-md p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-brand-400">
              <Shield size={20} />
              <h1 className="text-lg font-bold">{t('admin.title')}</h1>
            </div>
            <LanguageSwitcher />
          </div>
          <input
            type="password"
            placeholder={t('admin.apiKeyPlaceholder')}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-full bg-bg-input border border-border-strong rounded-md px-3 py-2 text-sm"
          />
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="button"
            className="w-full bg-brand-500 hover:bg-brand-600 text-white rounded-md py-2 text-sm font-semibold"
            onClick={tryAuth}
          >
            {t('admin.login')}
          </button>
        </GlassPanel>
      </div>
    );
  }

  return <>{children(key)}</>;
};

export const AdminPanel: React.FC<{ adminKey: string }> = ({ adminKey }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);
  const [draft, setDraft] = useState<EmotionAnalysisSettings | null>(null);
  const [tab, setTab] = useState<AdminTab>('system');
  const [emotionAdvanced, setEmotionAdvanced] = useState(false);
  const [speakersAdvanced, setSpeakersAdvanced] = useState(false);
  const [jsonAdvanced, setJsonAdvanced] = useState(false);

  const { data: status } = useQuery({
    queryKey: ['adminStatus', adminKey],
    queryFn: () => adminApi.getStatus(adminKey),
  });

  const { data: config, isLoading } = useQuery({
    queryKey: ['adminEmotionConfig', adminKey],
    queryFn: () => adminApi.getEmotionConfig(adminKey),
  });

  const { data: jobs } = useQuery({
    queryKey: ['adminRecentJobs', adminKey],
    queryFn: () => adminApi.getRecentJobs(adminKey),
  });

  useEffect(() => {
    if (config?.effective) setDraft(config.effective);
  }, [config]);

  const dirty = useMemo(
    () => Boolean(draft && config?.effective && !settingsEqual(draft, config.effective)),
    [draft, config],
  );

  const saveMutation = useMutation({
    mutationFn: () => adminApi.patchEmotionConfig(adminKey, draft!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEmotionConfig'] });
      addToast(t('admin.saved'), 'success');
    },
    onError: () => addToast(t('admin.saveFailed'), 'error'),
  });

  const resetMutation = useMutation({
    mutationFn: () => adminApi.resetEmotionConfig(adminKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminEmotionConfig'] });
      addToast(t('admin.resetDone'), 'success');
    },
    onError: () => addToast(t('admin.resetFailed'), 'error'),
  });

  const cacheMutation = useMutation({
    mutationFn: () => adminApi.clearEmotionCache(adminKey),
    onSuccess: (data) => addToast(t('admin.cacheCleared', { count: data.deleted_keys }), 'success'),
    onError: () => addToast(t('admin.cacheFailed'), 'error'),
  });

  const handleChange = (section: Section, key: string, value: boolean | number | string) => {
    if (!draft) return;
    const sectionDraft = draft[section] ?? {};
    setDraft({
      ...draft,
      [section]: { ...sectionDraft, [key]: value },
    });
  };

  const handleSave = () => saveMutation.mutate();

  const handleReset = () => {
    if (!window.confirm(t('admin.confirmReset'))) return;
    resetMutation.mutate();
  };

  const handleClearCache = () => {
    if (!window.confirm(t('admin.confirmClearCache'))) return;
    cacheMutation.mutate();
  };

  const settingsTabs: AdminTab[] = ['emotion', 'speakers', 'json'];
  const showActions = settingsTabs.includes(tab);

  if (isLoading || !draft) {
    return <div className="min-h-screen bg-bg-main p-8 text-txt-muted">{t('common.loading')}</div>;
  }

  return (
    <AdminLayout
      activeTab={tab}
      onTabChange={setTab}
      dirty={dirty}
      showActions={showActions}
      onSave={handleSave}
      onReset={handleReset}
      savePending={saveMutation.isPending}
    >
      {tab === 'system' && status && (
        <AdminSystemPanel
          status={status}
          onClearCache={handleClearCache}
          cachePending={cacheMutation.isPending}
        />
      )}

      {tab === 'emotion' && (
        <GlassPanel className="p-4 space-y-4">
          <EmotionSettingsForm
            settings={draft}
            onChange={handleChange}
            sections={['export']}
            variant="admin"
            quickOnly={!emotionAdvanced}
          />
          <button
            type="button"
            className="text-xs text-brand-400 hover:text-brand-300"
            onClick={() => setEmotionAdvanced((v) => !v)}
          >
            {emotionAdvanced ? t('admin.hideAdvanced') : t('admin.showAdvanced')}
          </button>
        </GlassPanel>
      )}

      {tab === 'speakers' && (
        <GlassPanel className="p-4 space-y-4">
          <EmotionSettingsForm
            settings={draft}
            onChange={handleChange}
            sections={['diarization', 'gender']}
            variant="admin"
            quickOnly
          />
          <button
            type="button"
            className="text-xs text-brand-400 hover:text-brand-300"
            onClick={() => setSpeakersAdvanced((v) => !v)}
          >
            {speakersAdvanced ? t('admin.hideAdvanced') : t('admin.showAdvanced')}
          </button>
          {speakersAdvanced && (
            <>
              <EmotionSettingsForm
                settings={draft}
                onChange={handleChange}
                sections={['diarization', 'gender']}
                variant="admin"
                excludeQuick
              />
              <EmotionSettingsForm
                settings={draft}
                onChange={handleChange}
                sections={['diarization', 'gender']}
                variant="admin"
                adminOnlyFields
              />
            </>
          )}
        </GlassPanel>
      )}

      {tab === 'json' && (
        <GlassPanel className="p-4 space-y-4">
          <EmotionSettingsForm
            settings={draft}
            onChange={handleChange}
            sections={['json_format', 'text_sentiment']}
            variant="admin"
            quickOnly
          />
          <button
            type="button"
            className="text-xs text-brand-400 hover:text-brand-300"
            onClick={() => setJsonAdvanced((v) => !v)}
          >
            {jsonAdvanced ? t('admin.hideAdvanced') : t('admin.showAdvanced')}
          </button>
          {jsonAdvanced && (
            <>
              <EmotionSettingsForm
                settings={draft}
                onChange={handleChange}
                sections={['json_format', 'text_sentiment']}
                variant="admin"
                excludeQuick
              />
              <EmotionSettingsForm
                settings={draft}
                onChange={handleChange}
                sections={['json_format', 'text_sentiment']}
                variant="admin"
                adminOnlyFields
              />
            </>
          )}
        </GlassPanel>
      )}

      {tab === 'jobs' && (
        <GlassPanel className="p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-txt-subtle mb-3">{t('admin.recentJobs')}</h2>
          <AdminJobsTable jobs={(jobs?.jobs ?? []) as Array<Record<string, unknown>>} />
        </GlassPanel>
      )}
    </AdminLayout>
  );
};

export const AdminApp: React.FC = () => (
  <AdminGate>{(adminKey) => <AdminPanel adminKey={adminKey} />}</AdminGate>
);
