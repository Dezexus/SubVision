import React from 'react';
import { Link } from 'react-router-dom';
import { Shield } from 'lucide-react';
import { LanguageSwitcher } from '../../../components/LanguageSwitcher';
import { Button } from '../../../shared/ui';
import { useTranslation } from '../../../i18n';
import { AdminTabs, type AdminTab } from './AdminTabs';

interface Props {
  activeTab: AdminTab;
  onTabChange: (tab: AdminTab) => void;
  dirty?: boolean;
  showActions?: boolean;
  onSave?: () => void;
  onReset?: () => void;
  savePending?: boolean;
  children: React.ReactNode;
}

export const AdminLayout: React.FC<Props> = ({
  activeTab,
  onTabChange,
  dirty,
  showActions,
  onSave,
  onReset,
  savePending,
  children,
}) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-bg-main text-txt-main">
      <header className="sticky top-0 z-20 bg-bg-main/95 backdrop-blur border-b border-border-main">
        <div className="max-w-4xl mx-auto px-6 py-4 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Shield className="text-brand-400" size={22} />
              {t('admin.title')}
            </h1>
            <div className="flex items-center gap-3">
              {dirty && (
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">
                  {t('admin.unsavedChanges')}
                </span>
              )}
              <LanguageSwitcher />
              <Link to="/" className="text-sm text-txt-muted hover:text-brand-400">{t('admin.backEditor')}</Link>
            </div>
          </div>
          <AdminTabs active={activeTab} onChange={onTabChange} />
          {showActions && (
            <div className="flex gap-2 pt-1">
              <Button variant="primary" onClick={onSave} disabled={savePending || !dirty}>
                {t('common.save')}
              </Button>
              <Button variant="secondary" onClick={onReset}>
                {t('common.reset')}
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-6">{children}</main>
    </div>
  );
};
