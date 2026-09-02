import React from 'react';
import { Cpu, ChevronDown } from 'lucide-react';
import { GEMINI_MODELS, GeminiModelOption } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface ModelSelectorProps {
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  disabled?: boolean;
  variant?: 'dark' | 'light' | 'compact';
  hideLabel?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  selectedModel,
  onSelectModel,
  disabled = false,
  variant = 'dark',
  hideLabel = false,
}) => {
  const { t } = useLanguage();
  const currentOption =
    GEMINI_MODELS.find((m) => m.id === selectedModel) || GEMINI_MODELS[0];

  if (variant === 'compact') {
    return (
      <div className="relative inline-flex items-center">
        <label htmlFor="model-select-compact" className="sr-only">
          {t.modelSelector.selectAiModel}
        </label>
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f0f4f9] border border-[#e6ebf2] text-[#191c20] text-xs font-semibold pointer-events-none">
          <Cpu className="w-3.5 h-3.5 text-[#0b57d0] shrink-0" />
          <span className="truncate max-w-[130px]">
            {currentOption.displayName}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-[#74777f] shrink-0" />
        </div>
        <select
          id="model-select-compact"
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          title={t.modelSelector.selectAiModel}
        >
          {GEMINI_MODELS.map((model: GeminiModelOption) => (
            <option key={model.id} value={model.id}>
              {model.displayName}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (variant === 'light') {
    return (
      <div className="space-y-1">
        {!hideLabel && (
          <label
            htmlFor="model-select-light"
            className="block text-[10px] font-bold uppercase tracking-wider text-[#44474e]"
          >
            {t.modelSelector.aiIntelligenceModel}
          </label>
        )}
        <div className="relative">
          <div className="w-full flex items-center justify-between p-2.5 rounded-[14px] bg-white hover:bg-[#f8f9fc] border border-[#c4c7cf] text-[#191c20] text-xs font-semibold pointer-events-none transition-colors">
            <div className="flex items-center gap-2.5 truncate">
              <div className="w-6 h-6 rounded-lg bg-[#d3e3fd] text-[#041e49] flex items-center justify-center shrink-0">
                <Cpu className="w-3.5 h-3.5" />
              </div>
              <span className="truncate text-xs">{currentOption.displayName}</span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-[#74777f] shrink-0 ml-2" />
          </div>
          <select
            id="model-select-light"
            value={selectedModel}
            onChange={(e) => onSelectModel(e.target.value)}
            disabled={disabled}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          >
            {GEMINI_MODELS.map((model: GeminiModelOption) => (
              <option key={model.id} value={model.id}>
                {model.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  // Default 'dark' variant (used on DestinationPromptView & Dark Modals)
  return (
    <div className="space-y-1.5">
      {!hideLabel && (
        <label
          htmlFor="model-select-dark"
          className="block text-[10px] font-bold uppercase tracking-wider text-[#44474e]"
        >
          {t.modelSelector.aiIntelligenceModel}
        </label>
      )}
      <div className="relative group">
        <div className="w-full flex items-center justify-between px-4 py-3 rounded-[20px] bg-[#f8f9fc] group-hover:bg-white border border-[#c4c7cf] focus-within:border-[#0b57d0] text-[#191c20] text-xs font-semibold pointer-events-none transition-all">
          <div className="flex items-center gap-3 truncate">
            <div className="w-8 h-8 rounded-full bg-[#d3e3fd] text-[#041e49] flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div className="text-left">
              <span className="block text-xs font-bold text-[#191c20] truncate">
                {currentOption.displayName}
              </span>
              <span className="block text-[10px] text-[#44474e] font-normal">
                {t.modelSelector.activeReasoningEngine}
              </span>
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-[#74777f] group-hover:text-[#191c20] shrink-0 ml-2 transition-colors" />
        </div>
        <select
          id="model-select-dark"
          value={selectedModel}
          onChange={(e) => onSelectModel(e.target.value)}
          disabled={disabled}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed bg-white text-[#191c20]"
        >
          {GEMINI_MODELS.map((model: GeminiModelOption) => (
            <option
              key={model.id}
              value={model.id}
              className="bg-white text-[#191c20] py-2"
            >
              {model.displayName}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
