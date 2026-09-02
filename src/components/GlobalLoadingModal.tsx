import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { useLoading } from '../context/LoadingContext';
import { useLanguage } from '../context/LanguageContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

export const GlobalLoadingModal: React.FC = () => {
  const { loadingState } = useLoading();
  const { language } = useLanguage();
  const isVi = language === 'vi';

  useBodyScrollLock(loadingState.isLoading);

  if (!loadingState.isLoading) {
    return null;
  }

  const defaultTitle = isVi ? 'Đang xử lý...' : 'Processing...';
  const displayTitle = loadingState.title || defaultTitle;
  const displayMessage = loadingState.message;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="global-loading-title"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-200"
    >
      <div
        className="bg-white text-[#191c20] rounded-[28px] max-w-sm sm:max-w-md w-full p-6 sm:p-8 shadow-2xl border border-[#e6ebf2] text-center space-y-4 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Animated Icon Container */}
        <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
          <div className="absolute inset-0 rounded-full bg-[#d3e3fd]/60 animate-ping opacity-75" />
          <div className="w-16 h-16 rounded-full bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center shadow-xs border border-[#c2e7ff] relative z-10">
            <Loader2 className="w-8 h-8 animate-spin stroke-[2.5]" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white text-[#6750a4] shadow-xs border border-[#e6ebf2] flex items-center justify-center z-20">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* Title & Contextual Message */}
        <div className="space-y-2">
          <h3
            id="global-loading-title"
            className="text-lg sm:text-xl font-bold tracking-tight text-[#191c20]"
          >
            {displayTitle}
          </h3>
          {displayMessage && (
            <p className="text-xs sm:text-sm text-[#44474e] leading-relaxed max-w-xs sm:max-w-sm mx-auto font-medium">
              {displayMessage}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
