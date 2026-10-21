import React from 'react';
import {
  X,
  Clock,
  Navigation,
  Sparkles,
  Check,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Globe,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Layers,
} from 'lucide-react';
import { ItineraryItem } from '../types';
import { getCategoryIcon } from '../lib/icons';
import { useLanguage } from '../context/LanguageContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface ItemDetailsModalProps {
  item: ItineraryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRequestPivot: (item: ItineraryItem) => void;
  onToggleComplete: (itemId: string) => void;
  isPassed?: boolean;
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

function formatTo24Hour(timeStr?: string, fallback: string = '09:00'): string {
  if (!timeStr) return fallback;
  const mins = parseTimeToMinutes(timeStr);
  if (mins < 0) return timeStr;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export const ItemDetailsModal: React.FC<ItemDetailsModalProps> = ({
  item,
  isOpen,
  onClose,
  onRequestPivot,
  onToggleComplete,
  isPassed = false,
}) => {
  const { t, language } = useLanguage();
  const isVi = language === 'vi';

  useBodyScrollLock(isOpen && Boolean(item));

  if (!isOpen || !item) return null;

  const isCompletionLocked = isPassed;
  const isCompleted = item.status === 'completed' || isPassed;
  const isOsmVerified = item.source === 'osm_verified' || item.osmVerified;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] border border-[#e6ebf2] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
        {/* Header - M3 Surface Container Header */}
        <div className="bg-[#f0f4f9] text-[#191c20] px-6 py-4 flex items-center justify-between border-b border-[#e6ebf2]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#d3e3fd] text-[#041e49] flex items-center justify-center shrink-0">
              {getCategoryIcon(item.category, 'w-5 h-5')}
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-[#44474e]">{isVi ? 'Chi tiết điểm dừng' : 'Stop Details'}</div>
              <h3 className="text-base font-bold tracking-tight text-[#191c20]">{item.title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white hover:bg-[#ecf0f6] text-[#44474e] hover:text-[#191c20] flex items-center justify-center transition-colors border border-[#e6ebf2]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Metadata Row (M3 Chips: Data Source, Indoor/Outdoor, Time, Category) */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Data Source Chip (Verified / AI Estimate) */}
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold border ${
                isOsmVerified
                  ? 'bg-[#e8f5e9] text-[#0f5223] border-[#146c2e]/25'
                  : 'bg-[#fef7da] text-[#735c00] border-[#dec400]/40'
              }`}
            >
              {isOsmVerified ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#146c2e] shrink-0" />
                  <span>{isVi ? 'Đã xác thực' : 'Verified'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-[#8c6b00] shrink-0" />
                  <span>{isVi ? 'Ước tính AI' : 'AI Estimate'}</span>
                </>
              )}
            </span>

            {/* Indoor / Outdoor Chip */}
            <span
              className={`px-3 py-1 rounded-lg font-semibold border ${
                item.indoorOutdoor === 'indoor'
                  ? 'bg-[#e8def8] text-[#21005d] border-[#6750a4]/20'
                  : 'bg-[#c2e7ff] text-[#001d35] border-[#00639b]/20'
              }`}
            >
              {item.indoorOutdoor === 'indoor' ? (isVi ? 'Trong nhà' : 'Indoor Space') : (isVi ? 'Ngoài trời' : 'Outdoor Stroll')}
            </span>

            {/* Time Chip */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#f0f4f9] border border-[#e6ebf2] font-semibold text-[#191c20]">
              <Clock className="w-3.5 h-3.5 text-[#0b57d0]" />
              <span>
                {formatTo24Hour(item.time)} {item.endTime ? `→ ${formatTo24Hour(item.endTime)}` : ''} ({item.durationMins} {isVi ? 'phút' : 'mins'})
              </span>
            </span>

            {/* Category Chip */}
            <span className="px-3 py-1 rounded-lg bg-[#f0f4f9] border border-[#e6ebf2] font-semibold text-[#44474e] capitalize">
              {item.category}
            </span>
          </div>

          {/* Description */}
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#44474e] block mb-1">
              {isVi ? 'Giới thiệu điểm dừng' : 'About This Stop'}
            </span>
            <p className="text-sm font-medium text-[#191c20] leading-relaxed">
              {item.subtitle}
            </p>
          </div>

          {/* Opening Hours Section (if available from OSM) */}
          {item.openingHours && (
            <div
              className={`p-3.5 rounded-[18px] border space-y-1.5 ${
                item.openingHours.isOpen === false
                  ? 'bg-[#ffebee]/60 border-[#ba1a1a]/30 text-[#410002]'
                  : item.openingHours.isOpen === true
                  ? 'bg-[#e8f5e9]/70 border-[#146c2e]/30 text-[#072711]'
                  : 'bg-[#f0f4f9] border-[#e6ebf2] text-[#191c20]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#0b57d0]" />
                  {isVi ? 'Giờ mở cửa (Dữ liệu OSM)' : 'Opening Hours (OSM Data)'}
                </span>
                {item.openingHours.isOpen === true && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c4eed0] text-[#072711]">
                    <CheckCircle2 className="w-3 h-3 text-[#146c2e]" />
                    {isVi ? 'Đang mở cửa' : 'Open for Visit'}
                  </span>
                )}
                {item.openingHours.isOpen === false && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#410002]">
                    <AlertTriangle className="w-3 h-3 text-[#ba1a1a]" />
                    {isVi ? 'Cảnh báo giờ đóng' : 'Hours Alert'}
                  </span>
                )}
              </div>

              <div className="font-semibold text-xs text-[#191c20]">
                {item.openingHours.todayHoursText || item.openingHours.raw}
              </div>

              {item.openingHours.warning && (
                <div className="text-xs text-[#ba1a1a] font-medium pt-1">
                  {item.openingHours.warning}
                </div>
              )}
            </div>
          )}

          {/* Location / Address (M3 Outlined Card) */}
          <div className="p-4 bg-[#f8f9fc] rounded-[20px] border border-[#e6ebf2] space-y-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#44474e] block mb-1">
                {isVi ? 'Địa điểm & Khu vực' : 'Location & Neighborhood'}
              </span>
              <div className="font-bold text-[#191c20] text-sm flex items-center gap-2">
                <Navigation className="w-4 h-4 text-[#0b57d0] shrink-0" />
                <span>{item.verifiedAddress || item.locationName}</span>
              </div>
              <div className="text-xs text-[#44474e] mt-1.5">
                {isVi ? 'Không gian / Phong cách:' : 'Vibe:'} <span className="text-[#191c20] font-semibold">{item.vibe}</span>
                {typeof item.lat === 'number' && typeof item.lng === 'number' && (
                  <span className="ml-2 text-[10px] text-[#74777f]">
                    ({item.lat.toFixed(4)}, {item.lng.toFixed(4)})
                  </span>
                )}
              </div>
            </div>

            {/* Extra OSM Metadata Chips (Website, Phone, Cuisine) */}
            {item.osmMetadata && (
              <div className="flex flex-wrap gap-2 pt-1 border-t border-[#e6ebf2]/60">
                {item.osmMetadata.website && (
                  <a
                    href={item.osmMetadata.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-[#e6ebf2] border border-[#c4c7cf]/60 text-[#0b57d0] font-semibold text-[11px] transition-colors"
                  >
                    <Globe className="w-3 h-3" />
                    <span>{isVi ? 'Trang web chính thức' : 'Official Website'}</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                )}
                {item.osmMetadata.phone && (
                  <a
                    href={`tel:${item.osmMetadata.phone}`}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white hover:bg-[#e6ebf2] border border-[#c4c7cf]/60 text-[#191c20] font-semibold text-[11px] transition-colors"
                  >
                    <Phone className="w-3 h-3 text-[#0b57d0]" />
                    <span>{item.osmMetadata.phone}</span>
                  </a>
                )}
                {item.osmMetadata.cuisine && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#f0f4f9] text-[#44474e] font-semibold text-[11px] capitalize">
                    {isVi ? 'Ẩm thực:' : 'Cuisine:'} {item.osmMetadata.cuisine}
                  </span>
                )}
              </div>
            )}

            {/* Action Links: Google Maps & OpenStreetMap */}
            <div className="pt-2 border-t border-[#e6ebf2] flex flex-wrap items-center gap-2">
              <a
                href={
                  typeof item.lat === 'number' && typeof item.lng === 'number' && item.lat !== 0 && item.lng !== 0
                    ? `https://www.google.com/maps/search/?api=1&query=${item.lat},${item.lng}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${item.title} ${item.locationName || ''}`.trim())}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-[#ecf0f6] text-[#0b57d0] hover:text-[#004bb7] font-bold text-xs border border-[#c4c7cf]/80 transition-all active:scale-95 shadow-xs"
              >
                <MapPin className="w-3.5 h-3.5 text-[#0b57d0] shrink-0" />
                <span>{isVi ? 'Mở trong Google Maps' : 'Open in Google Maps'}</span>
                <ExternalLink className="w-3 h-3 text-[#74777f] shrink-0" />
              </a>

              {item.osmUrl && (
                <a
                  href={item.osmUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white hover:bg-[#e8f5e9] text-[#146c2e] hover:text-[#0f5223] font-bold text-xs border border-[#c4c7cf]/80 transition-all active:scale-95 shadow-xs"
                >
                  <Globe className="w-3.5 h-3.5 text-[#146c2e] shrink-0" />
                  <span>OpenStreetMap</span>
                  <ExternalLink className="w-3 h-3 text-[#74777f] shrink-0" />
                </a>
              )}
            </div>
          </div>

          {/* Notes & Travel Tips */}
          {item.notes && (
            <div className="p-4 bg-[#c2e7ff]/30 rounded-[20px] border border-[#00639b]/20">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#001d35] block mb-1">
                {isVi ? 'Mẹo du lịch địa phương' : 'Local Travel Tip'}
              </span>
              <p className="text-[#001d35] leading-relaxed font-medium">
                {item.notes}
              </p>
            </div>
          )}

          {/* Swapped History if present */}
          {item.originalItem && (
            <div className="p-4 bg-[#e8def8]/40 rounded-[20px] border border-[#6750a4]/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#21005d] block mb-1 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#6750a4]" />
                {isVi ? 'Điều chỉnh lịch trình MatterMap' : 'MatterMap Dynamic Renegotiation'}
              </span>
              <div className="text-[#44474e]">
                {isVi ? 'Lịch trình ban đầu:' : 'Originally scheduled:'}{' '}
                <span className="line-through font-semibold text-[#74777f]">
                  {item.originalItem.title}
                </span>
              </div>
              {item.swapReason && (
                <div className="text-[#21005d] font-medium mt-1 text-xs">
                  {isVi ? 'Lý do:' : 'Reason:'} {item.swapReason}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions (M3 Buttons) */}
        <div className="p-4 sm:p-5 bg-[#f0f4f9] border-t border-[#e6ebf2] flex items-center gap-3">
          <button
            type="button"
            disabled={isCompletionLocked}
            title={isCompletionLocked ? (isVi ? 'Không thể hủy hoàn thành điểm đã qua' : 'Past stops cannot be marked incomplete') : undefined}
            onClick={() => {
              if (isCompletionLocked) return;
              onToggleComplete(item.id);
              onClose();
            }}
            className={`py-3.5 px-4 rounded-full border font-bold text-xs transition-all active:scale-98 flex items-center justify-center gap-2 ${
              !isCompleted && !isPassed ? 'flex-1' : 'w-full'
            } ${
              isCompletionLocked
                ? 'bg-[#ecf0f6] border-[#c4c7cf]/60 text-[#74777f] opacity-60 cursor-not-allowed'
                : isCompleted
                ? 'bg-[#d3e3fd] border-[#0b57d0] text-[#041e49] hover:bg-[#c2e7ff]'
                : 'bg-white hover:bg-[#ecf0f6] border-[#c4c7cf] text-[#191c20]'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>
              {isCompletionLocked
                ? (isVi ? 'Đã hoàn thành (Đã qua)' : 'Completed (Passed)')
                : isCompleted
                ? (isVi ? 'Đánh dấu chưa xong' : 'Mark Incomplete')
                : (isVi ? 'Đánh dấu đã đến' : 'Mark as Done')}
            </span>
          </button>

          {!isCompleted && !isPassed && (
            <button
              onClick={() => {
                onRequestPivot(item);
                onClose();
              }}
              className="flex-1 py-3.5 px-4 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs shadow-md transition-all active:scale-98 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-white" />
              <span>{isVi ? 'Đổi điểm dừng này' : 'Pivot This Stop'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
