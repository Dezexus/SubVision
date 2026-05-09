import React, { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { api } from '../../../services/api';
import { useConfigStore } from '../../../store/configStore';

export const LanguageSelector: React.FC = () => {
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const [availableLanguages, setAvailableLanguages] = useState<{code: string, name: string}[]>([]);

  useEffect(() => {
    const fetchLanguages = async () => {
      try {
        const data = await api.getLanguages();
        setAvailableLanguages(data);
      } catch (error) {
        console.error('Failed to fetch languages:', error);
      }
    };
    fetchLanguages();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-bold text-txt-subtle uppercase tracking-wider">
        <Globe size={16} className="text-brand-500" /> Language
      </div>
      <div className="relative">
        <select
          value={config.languages || 'en'}
          onChange={(e) => setConfig({ languages: e.target.value })}
          className="w-full bg-bg-input text-txt-main border border-border-strong rounded-md py-2 px-3 text-sm focus:outline-none focus:border-brand-500 transition-colors appearance-none cursor-pointer"
        >
          {availableLanguages.map((lang) => (
            <option key={lang.code} value={lang.code}>
              {lang.name}
            </option>
          ))}
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-txt-subtle">
          ▼
        </div>
      </div>
    </div>
  );
};