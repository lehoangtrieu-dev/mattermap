import React from 'react';
import { Sparkles, ArrowRight, X, Check, Clock, Navigation, AlertTriangle, ShieldCheck } from 'lucide-react';
import { SwapDecision, ItineraryItem } from '../types';
import { getCategoryIcon } from '../lib/icons';
import { useLanguage } from '../context/LanguageContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface SwapCardModalProps {
  decision: SwapDecision | null;
  targetItem: ItineraryItem | null;
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

function parseTimeToMinutes(timeStr?: string): number {
  if (!timeStr) return -1;
  const cleaned = timeStr.trim().toLowerCase();
  const isPM = cleaned.includes('pm');
  const isAM = cleaned.includes('am');
  const match = cleaned.match(/(\d{1,2}):(\d{2})/);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function formatTo24Hour(timeStr?: string, fallback: string = 'Scheduled'): string {
  if (!timeStr) return fallback;
  const mins = parseTimeToMinutes(timeStr);
  if (mins < 0) return timeStr;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const SwapCardModal: React.FC<SwapCardModalProps> = ({
  decision,
  targetItem,
  isOpen,
  onAccept,
  onDecline,
}) => {
  const { t, language } = useLanguage();
  const isVi = language === 'vi';

  useBodyScrollLock(isOpen && Boolean(decision && decision.status === 'PROPOSE_SWAP' && decision.proposed_swap));

  if (!isOpen || !decision || decision.status !== 'PROPOSE_SWAP' || !decision.proposed_swap) {
    return null;
  }

  const swap = decision.proposed_swap;
  const originalTitle = decision.skipped_place || targetItem?.title || (isVi ? 'Điểm đã lên lịch' : 'Current Scheduled Stop');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg h-full sm:h-auto sm:max-h-[90vh] min-h-screen sm:min-h-0 bg-white rounded-none sm:rounded-[28px] border-0 sm:border border-[#e6ebf2] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
        {/* Header Ribbon - M3 Surface Header */}
        <div className="bg-[#f0f4f9] text-[#191c20] px-5 sm:px-6 py-4 flex items-center justify-between border-b border-[#e6ebf2] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#ffdcc2] text-[#6e3900] flex items-center justify-center shrink-0 shadow-2xs">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-[#44474e]">MatterMap Pivot</div>
              <h3 className="text-base font-bold tracking-tight text-[#191c20]">{t.swapModal.headerTitle}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onDecline}
            className="w-8 h-8 rounded-full bg-white hover:bg-[#ecf0f6] text-[#44474e] hover:text-[#191c20] flex items-center justify-center transition-colors border border-[#e6ebf2] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body with internal scrolling on desktop */}
        <div className="p-5 sm:p-6 space-y-4 flex-1 overflow-y-auto min-h-0">
          {/* Trigger Alert Reason (M3 Warning Banner) */}
          <div className="p-4 rounded-[20px] bg-[#ffdcc2]/40 border border-[#ffcca6] flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#6e3900] shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-[#6e3900]">{t.swapModal.triggerLabel}</div>
              <p className="text-xs text-[#6e3900]/90 mt-0.5 leading-relaxed font-medium">
                {decision.trigger_reason}
              </p>
            </div>
          </div>

          {/* Before & After Swap Comparison */}
          <div className="space-y-3">
            {/* Original Skipped Plan */}
            <div className="p-4 rounded-[20px] bg-[#f8f9fc] border border-[#e6ebf2]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#ba1a1a] mb-1">
                {t.swapModal.skippedLabel}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#74777f] line-through decoration-[#ba1a1a] decoration-2">
                  {originalTitle}
                </span>
                <span className="text-xs font-medium text-[#74777f]">
                  {formatTo24Hour(targetItem?.time, isVi ? 'Đã lên lịch' : 'Scheduled')}
                </span>
              </div>
            </div>

            {/* Downward Arrow */}
            <div className="flex justify-center -my-1">
              <div className="w-8 h-8 rounded-full bg-[#d3e3fd] border border-[#0b57d0]/20 text-[#0b57d0] flex items-center justify-center shadow-xs">
                <ArrowRight className="w-4 h-4 rotate-90" />
              </div>
            </div>

            {/* Proposed Replacement in Bold (M3 Primary Container) */}
            <div className="p-5 rounded-[24px] bg-[#d3e3fd]/20 border-2 border-[#0b57d0] shadow-xs relative">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#041e49] bg-[#d3e3fd] px-3 py-0.5 rounded-full">
                  <Sparkles className="w-3.5 h-3.5 text-[#0b57d0]" />
                  {t.swapModal.proposedLabel}
                </span>
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#0b57d0]">
                  <Clock className="w-3.5 h-3.5 text-[#0b57d0]" />
                  <span>{swap.travel_time_mins} {isVi ? 'phút di chuyển' : 'min away'}</span>
                </div>
              </div>

              {/* Swap Venue Title */}
              <h4 className="text-lg font-bold text-[#191c20] tracking-tight mt-1">
                {swap.place_name}
              </h4>
              <p className="text-xs sm:text-sm text-[#44474e] mt-1.5 leading-relaxed">
                {swap.description}
              </p>

              {/* Badges */}
              <div className="flex flex-wrap items-center gap-2 mt-3.5 pt-3 border-t border-[#0b57d0]/20">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg bg-white border border-[#e6ebf2] text-[#191c20]">
                  {getCategoryIcon(swap.category, 'w-3.5 h-3.5')}
                  <span className="capitalize">{swap.category}</span>
                </span>
                <span
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border ${
                    swap.indoor_outdoor === 'indoor'
                      ? 'bg-[#e8def8] text-[#21005d] border-[#6750a4]/20'
                      : 'bg-[#c2e7ff] text-[#001d35] border-[#00639b]/20'
                  }`}
                >
                  {swap.indoor_outdoor === 'indoor' ? t.timeline.indoorBadge : t.timeline.outdoorBadge}
                </span>
                <span className="text-xs text-[#44474e] font-medium italic">
                  "{swap.vibe}"
                </span>
                {swap.osmVerified && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-[#e8f5e9] text-[#146c2e] border border-[#146c2e]/20">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#146c2e]" />
                    <span>OSM Verified</span>
                  </span>
                )}
                {swap.openingHours && swap.openingHours.isOpen === false && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-[#ffebee] text-[#ba1a1a] border border-[#ba1a1a]/20">
                    <span>⚠️ {t.timeline.hoursAlert}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* AI Justification (M3 Tonal Container) */}
          <div className="p-4 rounded-[20px] bg-[#f0f4f9] border border-[#e6ebf2]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-[#0b57d0] mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-[#0b57d0]" />
              {t.swapModal.justification}
            </div>
            <p className="text-xs leading-relaxed text-[#191c20] font-medium">
              "{decision.justification}"
            </p>
          </div>
        </div>

        {/* Action Buttons: M3 Filled & Outlined Buttons */}
        <div className="p-4 sm:p-5 bg-[#f0f4f9] border-t border-[#e6ebf2] flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 py-3.5 px-4 rounded-full border border-[#c4c7cf] text-[#44474e] font-bold text-xs sm:text-sm hover:bg-white transition-colors active:scale-98 cursor-pointer"
          >
            {t.swapModal.keepOriginal}
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-[2] py-3.5 px-5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs sm:text-sm shadow-md transition-all active:scale-98 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>{t.swapModal.acceptSwap}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
