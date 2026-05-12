import React, { useEffect, useState, useRef } from 'react';
import { Globe, ChevronDown, Check } from 'lucide-react';
import { useConfigStore } from '../../../store/configStore';
import { useLanguagesQuery } from '../queries/useLanguagesQuery';

export const LanguageSelector: React.FC = () => {
  const config = useConfigStore((s) => s.config);
  const setConfig = useConfigStore((s) => s.setConfig);
  const { data: availableLanguages = [] } = useLanguagesQuery();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLang = availableLanguages.find(l => l.code === (config.languages || 'en')) || { code: 'en', name: 'English' };

  return (
    <div className="flex flex-col gap-3" ref={dropdownRef}>
      <div className="flex items-center gap-2 text-sm font-bold text-txt-subtle uppercase tracking-wider">
        <Globe size={16} className="text-brand-500" /> Language
      </div>
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between bg-bg-input text-txt-main border rounded-md py-2.5 px-3 text-sm transition-all focus:outline-none ${
             isOpen ? 'border-brand-500 ring-1 ring-brand-500' : 'border-border-strong hover:border-border-hover'
          }`}
        >
          <span className="truncate">{selectedLang.name}</span>
          <ChevronDown size={16} className={`text-txt-subtle transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 bg-bg-panel border border-border-strong rounded-md shadow-lg max-h-48 overflow-y-auto animate-in fade-in slide-in-from-top-1">
            {availableLanguages.map((lang) => (
              <button
                key={lang.code}
                onClick={() => {
                  setConfig({ languages: lang.code });
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors ${
                  config.languages === lang.code ? 'bg-brand-500/10 text-brand-400' : 'text-txt-main hover:bg-bg-hover'
                }`}
              >
                <span className="truncate">{lang.name}</span>
                {config.languages === lang.code && <Check size={14} className="text-brand-500 flex-shrink-0" />}
              </button>
             ))}
          </div>
        )}
      </div>
    </div>
  );
};