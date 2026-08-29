import React from 'react';
import { GlassPanel } from '../../../shared/ui';
import { useTranslation } from '../../../i18n';
import type { adminApi } from '../../../shared/api/admin';

type Status = Awaited<ReturnType<typeof adminApi.getStatus>>;

interface Props {
  status: Status;
  onClearCache: () => void;
  cachePending?: boolean;
}

function StatusCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'error';
}) {
  const colors = {
    ok: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    warn: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    error: 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return (
    <div className={`rounded-lg border p-3 ${colors[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
    </div>
  );
}

export const AdminSystemPanel: React.FC<Props> = ({ status, onClearCache, cachePending }) => {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatusCard
          label={t('admin.statusRedis')}
          value={status.redis ? t('admin.ok') : t('admin.down')}
          tone={status.redis ? 'ok' : 'error'}
        />
        <StatusCard
          label={t('admin.statusHf')}
          value={status.hf_token_configured ? t('admin.configured') : t('admin.notConfigured')}
          tone={status.hf_token_configured ? 'ok' : 'warn'}
        />
        <StatusCard
          label={t('admin.statusGigaam')}
          value={status.gigaam_available ? t('admin.installed') : t('admin.stub')}
          tone={status.gigaam_available ? 'ok' : 'warn'}
        />
        <StatusCard
          label={t('admin.statusWeights')}
          value={status.gigaam_weights_cached ? t('admin.cached') : t('admin.notCached')}
          tone={status.gigaam_weights_cached ? 'ok' : 'warn'}
        />
        <StatusCard
          label={t('admin.statusPyannote')}
          value={status.pyannote_available ? t('admin.installed') : t('admin.stub')}
          tone={status.pyannote_available ? 'ok' : 'warn'}
        />
      </div>
      <GlassPanel className="p-4 space-y-3">
        <p className="text-xs text-txt-subtle">{t('admin.hfHint')}</p>
        <button
          type="button"
          disabled={cachePending}
          onClick={onClearCache}
          className="text-xs px-3 py-2 rounded-md border border-border-strong hover:border-brand-500 text-txt-muted hover:text-brand-400 transition-colors disabled:opacity-50"
        >
          {t('admin.clearCache')}
        </button>
      </GlassPanel>
    </div>
  );
};
