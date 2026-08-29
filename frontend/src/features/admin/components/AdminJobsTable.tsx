import React, { useState } from 'react';
import { useTranslation } from '../../../i18n';

interface JobRow {
  job_id?: string;
  filename?: string;
  cues?: number;
  output?: string;
  client_id?: string;
  [key: string]: unknown;
}

interface Props {
  jobs: JobRow[];
}

export const AdminJobsTable: React.FC<Props> = ({ jobs }) => {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<JobRow | null>(null);

  if (!jobs.length) {
    return <p className="text-sm text-txt-subtle">{t('admin.noJobs')}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-txt-subtle border-b border-border-main">
              <th className="py-2 pr-2">{t('admin.jobId')}</th>
              <th className="py-2 pr-2">{t('admin.jobFile')}</th>
              <th className="py-2 pr-2">{t('admin.jobCues')}</th>
              <th className="py-2">{t('admin.jobOutput')}</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, i) => (
              <tr
                key={job.job_id ?? i}
                className="border-b border-border-main/50 hover:bg-bg-hover cursor-pointer"
                onClick={() => setSelected(job)}
              >
                <td className="py-2 pr-2 font-mono truncate max-w-[120px]">{job.job_id ?? '—'}</td>
                <td className="py-2 pr-2 truncate max-w-[140px]">{job.filename ?? '—'}</td>
                <td className="py-2 pr-2">{job.cues ?? '—'}</td>
                <td className="py-2 truncate max-w-[140px]">{job.output ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selected && (
        <div className="bg-bg-surface border border-border-main rounded-lg p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-txt-subtle">{t('admin.jobDetails')}</span>
            <button type="button" className="text-xs text-txt-muted hover:text-txt-main" onClick={() => setSelected(null)}>
              {t('common.cancel')}
            </button>
          </div>
          <pre className="text-[10px] overflow-auto max-h-48">{JSON.stringify(selected, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
