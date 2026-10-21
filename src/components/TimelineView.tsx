import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Clock,
  Navigation,
  Sparkles,
  Check,
  ChevronRight,
  Calendar,
  MapPin,
  Map as MapIcon,
  Maximize2,
  ChevronDown,
  ChevronUp,
  LocateFixed,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Columns2,
  List,
  Loader2,
} from 'lucide-react';
import { ItineraryItem } from '../types';
import { getCategoryIcon } from '../lib/icons';
import { ItineraryMap } from './ItineraryMap';
import { useLanguage } from '../context/LanguageContext';

interface TimelineViewProps {
  items: ItineraryItem[];
  destinationName?: string;
  startTime?: string;
  endTime?: string;
  startDate?: string;
  numDays?: number;
  onSelectItem: (item: ItineraryItem) => void;
  onRequestPivotForStop: (item: ItineraryItem) => void;
  onRequestLate?: (item: ItineraryItem, delayMins: number) => void;
  onToggleComplete: (itemId: string) => void;
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error';
  onRetrySave?: () => void;
  onCheckStatus?: () => void;
  isEvaluating?: boolean;
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

function formatDayHeaderDate(dateStr?: string, dayNumber: number = 1, isVi: boolean = false): string {
  const dayPrefix = isVi ? `Ngày ${dayNumber}` : `Day ${dayNumber}`;
  if (!dateStr) return dayPrefix;
  try {
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00Z`);
    if (isNaN(d.getTime())) return dayPrefix;
    if (isVi) {
      const month = d.getUTCMonth() + 1;
      const date = d.getUTCDate();
      return `${dayPrefix} · ${date} thg ${month}`;
    } else {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[d.getUTCMonth()];
      const date = d.getUTCDate();
      return `${dayPrefix} · ${month} ${date}`;
    }
  } catch {
    return dayPrefix;
  }
}

interface DayGroup {
  dayNumber: number;
  dayDate: string;
  dayLabel: string;
  items: ItineraryItem[];
  isPastDay: boolean;
  isToday: boolean;
  isFutureDay: boolean;
}

export const TimelineView: React.FC<TimelineViewProps> = ({
  items,
  destinationName,
  startTime,
  endTime,
  startDate,
  numDays = 1,
  onSelectItem,
  onRequestPivotForStop,
  onRequestLate,
  onToggleComplete,
  saveStatus = 'idle',
  onRetrySave,
  onCheckStatus,
  isEvaluating = false,
}) => {
  const { t, language } = useLanguage();
  const isVi = language === 'vi';

  // Live system clock syncing with client's actual system time in 24-hour format
  const [liveClock, setLiveClock] = useState<Date>(new Date());
  const hasAutoScrolledRef = useRef<boolean>(false);

  // Desktop View Mode: 'split' (default) | 'list' | 'map'
  const [desktopViewMode, setDesktopViewMode] = useState<'split' | 'list' | 'map'>('split');

  // Map & Layout state
  const [activeMapDay, setActiveMapDay] = useState<number>(1);
  const [selectedMapItemId, setSelectedMapItemId] = useState<string | null>(null);
  const [isMobileMapExpanded, setIsMobileMapExpanded] = useState<boolean>(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setLiveClock(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const liveHours = String(liveClock.getHours()).padStart(2, '0');
  const liveMins = String(liveClock.getMinutes()).padStart(2, '0');
  const liveSecs = String(liveClock.getSeconds()).padStart(2, '0');
  const liveTimeString = `${liveHours}:${liveMins}:${liveSecs}`;

  const nowMinutes = liveClock.getHours() * 60 + liveClock.getMinutes();

  // Local client YYYY-MM-DD
  const clientYear = liveClock.getFullYear();
  const clientMonth = String(liveClock.getMonth() + 1).padStart(2, '0');
  const clientDay = String(liveClock.getDate()).padStart(2, '0');
  const clientTodayDateStr = `${clientYear}-${clientMonth}-${clientDay}`;

  const effectiveStartTime = formatTo24Hour(
    startTime || (items.length > 0 ? items[0].time : '09:30')
  );
  const effectiveEndTime = formatTo24Hour(
    endTime || (items.length > 0 ? items[items.length - 1].endTime || items[items.length - 1].time : '18:00')
  );

  // 1. Group items by dayNumber
  const dayMap = new Map<number, ItineraryItem[]>();
  items.forEach((item) => {
    const dNum = item.dayNumber || 1;
    if (!dayMap.has(dNum)) {
      dayMap.set(dNum, []);
    }
    dayMap.get(dNum)!.push(item);
  });

  // Ensure all days up to numDays exist
  const totalDaysCount = Math.max(numDays, dayMap.size > 0 ? Math.max(...Array.from(dayMap.keys())) : 1);
  const dayNumbers = Array.from({ length: totalDaysCount }, (_, i) => i + 1);

  // Compute day date strings
  const baseStartDate = startDate || items[0]?.dayDate || clientTodayDateStr;

  const dayGroups: DayGroup[] = dayNumbers.map((dNum) => {
    const dayItems = dayMap.get(dNum) || [];
    let dDateStr = dayItems[0]?.dayDate;
    if (!dDateStr) {
      try {
        const base = new Date(`${baseStartDate}T12:00:00Z`);
        if (!isNaN(base.getTime())) {
          const offsetDate = new Date(base.getTime() + (dNum - 1) * 86400000);
          const y = offsetDate.getUTCFullYear();
          const m = String(offsetDate.getUTCMonth() + 1).padStart(2, '0');
          const d = String(offsetDate.getUTCDate()).padStart(2, '0');
          dDateStr = `${y}-${m}-${d}`;
        } else {
          dDateStr = clientTodayDateStr;
        }
      } catch {
        dDateStr = clientTodayDateStr;
      }
    }

    const isPastDay = dDateStr < clientTodayDateStr;
    const isToday = dDateStr === clientTodayDateStr;
    const isFutureDay = dDateStr > clientTodayDateStr;

    return {
      dayNumber: dNum,
      dayDate: dDateStr,
      dayLabel: formatDayHeaderDate(dDateStr, dNum, isVi),
      items: dayItems,
      isPastDay,
      isToday,
      isFutureDay,
    };
  });

  // Identify active day
  const todayDayGroup = dayGroups.find((g) => g.isToday);
  const activeDayGroup = todayDayGroup || dayGroups.find((g) => !g.isPastDay) || dayGroups[0];
  const activeDayNumber = activeDayGroup ? activeDayGroup.dayNumber : 1;

  // Sync activeMapDay when activeDayNumber first initializes
  useEffect(() => {
    if (activeDayNumber) {
      setActiveMapDay(activeDayNumber);
    }
  }, [activeDayNumber]);

  // 2. Identify SINGLE in-progress stop
  let inProgressItemId: string | null = null;
  if (todayDayGroup && todayDayGroup.items.length > 0) {
    const activeDayItems = todayDayGroup.items;

    const currentlyOccurring = activeDayItems.find((item) => {
      if (item.status === 'completed') return false;
      const startM = parseTimeToMinutes(item.time);
      const endM = item.endTime
        ? parseTimeToMinutes(item.endTime)
        : startM + (item.durationMins || 60);
      return startM >= 0 && nowMinutes >= startM && nowMinutes < endM;
    });

    if (currentlyOccurring) {
      inProgressItemId = currentlyOccurring.id;
    } else {
      const nextUpcoming = activeDayItems.find((item) => {
        if (item.status === 'completed') return false;
        const startM = parseTimeToMinutes(item.time);
        const endM = item.endTime
          ? parseTimeToMinutes(item.endTime)
          : startM + (item.durationMins || 60);
        return endM > 0 && nowMinutes < endM;
      });

      if (nextUpcoming) {
        inProgressItemId = nextUpcoming.id;
      }
    }
  }

  // Auto-scroll to active day section on initial load
  useEffect(() => {
    if (!hasAutoScrolledRef.current && activeDayNumber) {
      hasAutoScrolledRef.current = true;
      const timer = setTimeout(() => {
        const targetEl = document.getElementById(`day-section-${activeDayNumber}`);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [activeDayNumber]);

  // Set of completed item IDs for synchronizing list and map styling in real time
  const completedItemIds = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      const itemDay = item.dayNumber || 1;
      const itemDayGroup = dayGroups.find((g) => g.dayNumber === itemDay);
      if (itemDayGroup?.isPastDay) {
        set.add(item.id);
      } else if (item.status === 'completed') {
        set.add(item.id);
      } else if (itemDayGroup?.isToday) {
        const itemStartM = parseTimeToMinutes(item.time);
        const itemEndM = item.endTime
          ? parseTimeToMinutes(item.endTime)
          : itemStartM + (item.durationMins || 60);
        if (itemEndM > 0 && nowMinutes >= itemEndM && item.id !== inProgressItemId) {
          set.add(item.id);
        }
      }
    });
    return set;
  }, [items, dayGroups, nowMinutes, inProgressItemId]);

  const completedCount = completedItemIds.size;

  return (
    <div className="py-4 sm:py-6 px-4 sm:px-6 lg:px-8 w-full max-w-full space-y-6">
      {/* Pinned Destination & Live System Clock Card (Trip Overview Header - M3 Elevated Card) */}
      <div className="p-4 sm:p-5 bg-white rounded-[24px] border border-[#e6ebf2] shadow-xs space-y-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
          <div className="min-w-0 max-w-full">
            <h2 className="text-lg sm:text-xl font-bold text-[#191c20] tracking-tight break-words">
              {destinationName || (isVi ? 'Lịch trình du lịch' : 'Travel Itinerary')}
            </h2>
            {totalDaysCount > 1 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#44474e] mt-1">
                <Calendar className="w-3.5 h-3.5 text-[#0b57d0] shrink-0" />
                <span>
                  {t.timeline.tripDaysActive(totalDaysCount, activeDayNumber)}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2 w-full sm:w-auto shrink-0">
            {/* Check Status Button (M3 Outlined / Tonal Button) */}
            {onCheckStatus && (
              <button
                type="button"
                onClick={onCheckStatus}
                disabled={isEvaluating}
                className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-[#f0f4f9] text-[#0b57d0] text-xs font-bold border border-[#c4c7cf] shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                title={isVi ? 'Kiểm tra tín hiệu điều kiện thực tế, giờ mở cửa OSM và thời tiết' : 'Check real-time condition signals, OSM opening hours, and weather'}
              >
                <Sparkles className={`w-3.5 h-3.5 text-[#0b57d0] ${isEvaluating ? 'animate-spin' : ''}`} />
                <span className="whitespace-nowrap">{isEvaluating ? t.timeline.checkingStatus : t.timeline.checkStatus}</span>
              </button>
            )}

            {/* Desktop View Mode Segmented Selector (Split / List / Map) - Desktop Only */}
            <div className="hidden lg:inline-flex items-center p-0.5 rounded-full bg-[#f0f4f9] border border-[#c4c7cf]/80 shadow-2xs">
              <button
                type="button"
                onClick={() => setDesktopViewMode('split')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  desktopViewMode === 'split'
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#44474e] hover:text-[#191c20] hover:bg-white/50'
                }`}
                title={isVi ? 'Chế độ chia đôi: Lịch trình và bản đồ tương tác song song' : 'Split View: Side-by-side timeline and interactive map'}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>{t.timeline.splitView}</span>
              </button>
              <button
                type="button"
                onClick={() => setDesktopViewMode('list')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  desktopViewMode === 'list'
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#44474e] hover:text-[#191c20] hover:bg-white/50'
                }`}
                title={isVi ? 'Chế độ danh sách: Toàn màn hình danh sách lịch trình' : 'List View: Full-width focused timeline'}
              >
                <List className="w-3.5 h-3.5" />
                <span>{t.timeline.listView}</span>
              </button>
              <button
                type="button"
                onClick={() => setDesktopViewMode('map')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  desktopViewMode === 'map'
                    ? 'bg-[#0b57d0] text-white shadow-xs'
                    : 'text-[#44474e] hover:text-[#191c20] hover:bg-white/50'
                }`}
                title={isVi ? 'Chế độ bản đồ: Toàn màn hình bản đồ lộ trình tương tác' : 'Map View: Full-width interactive route map'}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>{t.timeline.mapView}</span>
              </button>
            </div>

            {/* Auto-save Status Indicator with Error & Retry support (Visible on mobile & desktop) */}
            {saveStatus && saveStatus !== 'idle' && (
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                  saveStatus === 'error'
                    ? 'bg-[#ffebee] border-[#ffcdd2] text-[#ba1a1a]'
                    : saveStatus === 'saving'
                    ? 'bg-[#e8f0fe] border-[#d3e3fd] text-[#0b57d0]'
                    : 'bg-[#f0f4f9] border-[#e6ebf2] text-[#146c2e]'
                }`}
                title={
                  saveStatus === 'saving'
                    ? t.timeline.autoSavingCloud
                    : saveStatus === 'saved'
                    ? t.timeline.autoSavedCloud
                    : t.timeline.autoSaveFailed
                }
              >
                {saveStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-[#0b57d0] animate-spin" />
                    <span>{t.timeline.saving}</span>
                  </>
                ) : saveStatus === 'saved' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#146c2e]" />
                    <span>{t.timeline.saved}</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-3.5 h-3.5 text-[#ba1a1a]" />
                    <span>{t.timeline.saveFailed}</span>
                    {onRetrySave && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRetrySave();
                        }}
                        className="ml-0.5 px-2 py-0.5 rounded-full bg-[#ba1a1a] hover:bg-[#93000a] text-white text-[10px] font-bold cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                        title={isVi ? 'Thử lưu lại chuyến đi vào đám mây' : 'Retry saving trip to cloud'}
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                        <span>{t.timeline.retry}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Live System Clock Pill (M3 Tonal Pill) */}
            <div
              className="shrink-0 hidden xs:flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-[#ecf0f6] text-[#191c20] border border-[#c4c7cf]/60 font-mono text-xs shadow-xs"
              title={isVi ? 'Đồng hồ hệ thống thời gian thực (24h)' : 'Live Client Local System Time (24h)'}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold">{liveTimeString}</span>
            </div>
          </div>

        </div>

        {/* Planned Time Window & Progress (M3 Tonal Row) */}
        <div className="pt-3 border-t border-[#e6ebf2] flex items-center justify-between text-xs text-[#44474e] gap-2">
          <div className="flex items-center gap-2 font-medium min-w-0 truncate">
            <Clock className="w-4 h-4 text-[#0b57d0] shrink-0" />
            <span className="hidden sm:inline">{t.timeline.dailyWindow}:</span>
            <span className="font-bold text-[#191c20]">
              {effectiveStartTime} → {effectiveEndTime}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-[#041e49] bg-[#d3e3fd] px-3 py-1 rounded-full shrink-0">
              {t.timeline.doneCount(completedCount, items.length)}
            </span>
          </div>
        </div>
      </div>

      {/* MOBILE MAP SECTION (Collapsible & Smooth) */}
      <div className="lg:hidden">
        {isMobileMapExpanded ? (
          <div id="itinerary-map-section" className="space-y-2 animate-in fade-in duration-200">
            <ItineraryMap
              items={items}
              activeDayNumber={activeMapDay}
              totalDays={totalDaysCount}
              onDayChange={setActiveMapDay}
              selectedItemId={selectedMapItemId}
              onCenteringComplete={() => setSelectedMapItemId(null)}
              inProgressItemId={inProgressItemId}
              completedItemIds={completedItemIds}
              onSelectItem={onSelectItem}
              destinationName={destinationName}
              onHideMap={() => setIsMobileMapExpanded(false)}
              isCompact={false}
              className="shadow-md"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setIsMobileMapExpanded(true)}
            className="w-full p-3.5 bg-[#f0f4f9] hover:bg-[#e6ebf2] text-[#191c20] rounded-[20px] border border-[#c4c7cf]/60 shadow-xs flex items-center justify-between transition-all group active:scale-[0.99]"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-white text-[#0b57d0] border border-[#c4c7cf]/60 flex items-center justify-center shadow-xs">
                <MapIcon className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-[#191c20]">{t.timeline.viewRouteMap}</div>
                <div className="text-[11px] text-[#44474e]">
                  {t.timeline.seeStopLocations}
                </div>
              </div>
            </div>
            <span className="px-3.5 py-1.5 bg-white text-[#0b57d0] rounded-full text-xs font-bold border border-[#c4c7cf]/60 shadow-xs group-hover:border-[#0b57d0]">
              {t.timeline.openMap}
            </span>
          </button>
        )}
      </div>

      {/* MAIN CONTENT AREA: DESKTOP ADAPTIVE LAYOUT (Split / List / Map) */}
      <div className={`w-full ${desktopViewMode === 'split' ? 'lg:grid lg:grid-cols-12 lg:gap-8 items-start' : ''}`}>
        {/* LEFT / PRIMARY COLUMN: VERTICAL TIMELINE LIST (Visible in Split & List modes) */}
        {desktopViewMode !== 'map' && (
          <div className={`w-full space-y-8 ${desktopViewMode === 'split' ? 'lg:col-span-7' : 'lg:max-w-4xl lg:mx-auto'}`}>
            {dayGroups.map((dayGroup) => {
              return (
                <section
                  key={dayGroup.dayNumber}
                  id={`day-section-${dayGroup.dayNumber}`}
                  className="scroll-mt-24 space-y-4"
                >
                {/* Day Divider & Header (M3 Date Badge) */}
                <div className="flex items-center justify-between gap-2.5 pt-1 pb-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveMapDay(dayGroup.dayNumber)}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-white shadow-xs transition-all ${
                        activeMapDay === dayGroup.dayNumber ? 'bg-[#0b57d0] ring-2 ring-[#d3e3fd]' : 'bg-[#0b57d0]'
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5 text-white" />
                      <span className="text-xs font-bold tracking-tight">
                        {dayGroup.dayLabel}
                      </span>
                    </button>

                    {dayGroup.isToday && (
                      <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#c2e7ff] text-[#001d35] border border-[#00639b]/20">
                        {t.timeline.todayBadge}
                      </span>
                    )}

                    {dayGroup.isPastDay && (
                      <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-[#ecf0f6] text-[#44474e]">
                        {t.timeline.passedBadge}
                      </span>
                    )}

                    {dayGroup.isFutureDay && (
                      <span className="text-xs uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full bg-white text-[#74777f] border border-[#c4c7cf]/70">
                        {t.timeline.upcomingDayBadge}
                      </span>
                    )}
                  </div>
                </div>

                {/* Stops for this Day */}
                {dayGroup.items.length === 0 ? (
                  <div className="p-6 rounded-[20px] border border-dashed border-[#c4c7cf] text-center text-xs text-[#74777f] bg-white">
                    {t.timeline.noStopsForDay}
                  </div>
                ) : (
                  <div className="relative pl-6 sm:pl-8 space-y-4">
                    {/* Continuous Vertical Timeline Line */}
                    <div className="absolute left-[11px] sm:left-[15px] top-3 bottom-4 w-[2px] bg-[#e6ebf2]" />

                    {dayGroup.items.map((item, idx) => {
                      const itemStartM = parseTimeToMinutes(item.time);
                      const itemEndM = item.endTime
                        ? parseTimeToMinutes(item.endTime)
                        : itemStartM + (item.durationMins || 60);

                      // Determine past, in-progress, completed status
                      let isPassed = false;
                      let isCompleted = false;
                      let isInProgress = false;

                      if (dayGroup.isPastDay) {
                        isPassed = true;
                        isCompleted = true;
                        isInProgress = false;
                      } else if (dayGroup.isFutureDay) {
                        isPassed = false;
                        isCompleted = item.status === 'completed';
                        isInProgress = false;
                      } else {
                        // Today
                        const isPassedByTime =
                          itemEndM > 0 && nowMinutes >= itemEndM && item.id !== inProgressItemId;
                        isPassed = isPassedByTime || (item.status === 'completed' && itemEndM > 0 && nowMinutes >= itemEndM);
                        isCompleted = item.status === 'completed' || isPassedByTime;
                        isInProgress = !isPassed && !isCompleted && item.id === inProgressItemId;
                      }

                      return (
                        <div
                          key={item.id}
                          id={`stop-card-${item.id}`}
                          className="relative group transition-all duration-300"
                        >
                          {/* Timeline Node Icon/Dot */}
                          <button
                            type="button"
                            disabled={isPassed}
                            onClick={() => {
                              if (isPassed) return;
                              onToggleComplete(item.id);
                            }}
                            title={
                              isPassed
                                ? (isVi ? 'Điểm đã qua (không thể thay đổi)' : 'Passed stop (completion locked)')
                                : isCompleted
                                ? (isVi ? 'Đánh dấu chưa xong' : 'Mark incomplete')
                                : (isVi ? 'Đánh dấu đã xong' : 'Mark as done')
                            }
                            className={`absolute -left-[27px] sm:-left-[31px] top-3.5 w-7 h-7 rounded-full flex items-center justify-center transition-all border-2 z-10 ${
                              isPassed
                                ? 'bg-[#44474e] border-[#44474e] text-white shadow-xs cursor-default opacity-80'
                                : isCompleted
                                ? 'bg-[#191c20] border-[#191c20] text-white shadow-xs cursor-pointer'
                                : isInProgress
                                ? 'bg-[#0b57d0] border-white ring-4 ring-[#d3e3fd] text-white shadow-md scale-110 cursor-pointer'
                                : 'bg-white border-[#c4c7cf] text-[#44474e] hover:border-[#0b57d0] cursor-pointer'
                            }`}
                          >
                            {isCompleted ? (
                              <Check className="w-4 h-4 stroke-[3]" />
                            ) : (
                              <span className="text-xs font-bold">{idx + 1}</span>
                            )}
                          </button>

                          {/* Stop Card (M3 Elevated / Outlined Card) */}
                          <div
                            onClick={() => {
                              setActiveMapDay(dayGroup.dayNumber);
                              setSelectedMapItemId(item.id);
                              onSelectItem(item);
                            }}
                            className={`rounded-[20px] p-4 sm:p-5 transition-all duration-200 border cursor-pointer relative ${
                              isInProgress
                                ? 'bg-white border-2 border-[#0b57d0] ring-4 ring-[#d3e3fd]/60 shadow-lg'
                                : isCompleted
                                ? 'bg-[#f8f9fc] border-[#e6ebf2] opacity-75'
                                : 'bg-white border-[#c4c7cf]/70 shadow-xs hover:border-[#0b57d0]/60 hover:shadow-md'
                            }`}
                          >
                            {/* Top Row: Time, Category, Indoor/Outdoor Badge & Locate on Map */}
                            <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#44474e] min-w-0 truncate">
                                <Clock className="w-3.5 h-3.5 text-[#0b57d0] shrink-0" />
                                <span className="font-bold text-[#191c20] shrink-0">
                                  {formatTo24Hour(item.time)}
                                </span>
                                {item.endTime && (
                                  <span className="text-[#74777f] shrink-0">
                                    → {formatTo24Hour(item.endTime)}
                                  </span>
                                )}
                                <span className="text-[#c4c7cf] shrink-0">•</span>
                                <span className="shrink-0">{item.durationMins}m</span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0 overflow-hidden">
                                {/* Category Pill (M3 Assist Chip) */}
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-medium bg-[#f0f4f9] text-[#191c20] border border-[#e6ebf2] max-w-[110px] sm:max-w-none truncate shrink-0">
                                  {getCategoryIcon(item.category, 'w-3.5 h-3.5 shrink-0')}
                                  <span className="capitalize truncate hidden xs:inline">
                                    {item.category}
                                  </span>
                                </span>

                                {/* Indoor / Outdoor Pill */}
                                <span
                                  className={`px-2 py-0.5 rounded-lg text-xs font-medium shrink-0 hidden xs:inline-flex ${
                                    item.indoorOutdoor === 'indoor'
                                      ? 'bg-[#e8def8] text-[#21005d] border border-[#6750a4]/20'
                                      : 'bg-[#c2e7ff] text-[#001d35] border border-[#00639b]/20'
                                  }`}
                                >
                                  {item.indoorOutdoor === 'indoor' ? t.timeline.indoorBadge : t.timeline.outdoorBadge}
                                </span>

                                {/* OSM Verified Badge */}
                                {(item.source === 'osm_verified' || item.osmVerified) && (
                                  <span
                                    title={isVi ? 'Địa điểm đã xác thực trên OpenStreetMap' : 'OpenStreetMap Verified Location'}
                                    className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[#e8f5e9] text-[#146c2e] border border-[#146c2e]/20 shrink-0"
                                  >
                                    <ShieldCheck className="w-3 h-3 text-[#146c2e]" />
                                    <span>OSM</span>
                                  </span>
                                )}

                                {/* Opening Hours Alert (if closed at planned time) */}
                                {item.openingHours && item.openingHours.isOpen === false && (
                                  <span
                                    title={item.openingHours.warning || (isVi ? 'Có thể đóng cửa trong khung giờ ghé thăm' : 'May be closed during visit')}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-[#ffebee] text-[#ba1a1a] border border-[#ba1a1a]/20 shrink-0 animate-pulse"
                                  >
                                    <AlertTriangle className="w-3 h-3 text-[#ba1a1a]" />
                                    <span className="hidden sm:inline">{t.timeline.hoursAlert}</span>
                                  </span>
                                )}

                                {/* Quick Map Pin Button */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMapDay(dayGroup.dayNumber);
                                    setSelectedMapItemId(item.id);
                                    setIsMobileMapExpanded(true);
                                    document.getElementById('itinerary-map-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                  }}
                                  title={isVi ? 'Định vị trên bản đồ' : 'Center on Map'}
                                  className="p-1 text-[#0b57d0] hover:bg-[#d3e3fd]/60 rounded-full border border-transparent hover:border-[#c4c7cf] transition-all"
                                >
                                  <LocateFixed className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Swapped Notice if applicable (M3 Tonal Container) */}
                            {item.originalItem && (
                              <div className="mb-3 p-3 rounded-2xl bg-[#e8def8]/50 border border-[#6750a4]/30 text-xs">
                                <div className="flex items-center gap-1.5 text-[#21005d] font-semibold mb-0.5">
                                  <Sparkles className="w-3.5 h-3.5 text-[#6750a4]" />
                                  <span>{t.timeline.renegotiatedBy}</span>
                                </div>
                                <div className="text-[#44474e] text-xs flex items-center gap-1.5">
                                  <span>{t.timeline.replacedLabel}</span>
                                  <span className="line-through text-[#74777f] font-medium">
                                    {item.originalItem.title}
                                  </span>
                                </div>
                                {item.swapReason && (
                                  <p className="text-xs text-[#21005d] mt-1 font-medium leading-relaxed">
                                    {item.swapReason}
                                  </p>
                                )}
                              </div>
                            )}

                            {/* Title & Subtitle */}
                            <div className="group/title">
                              <div className="flex items-center justify-between gap-1">
                                <h3
                                  className={`text-base sm:text-lg font-bold tracking-tight transition-colors ${
                                    isCompleted
                                      ? 'line-through text-[#74777f]'
                                      : isInProgress
                                      ? 'text-[#0b57d0]'
                                      : 'text-[#191c20] group-hover/title:text-[#0b57d0]'
                                  }`}
                                >
                                  {item.title}
                                </h3>
                                <ChevronRight className="w-4 h-4 text-[#74777f] group-hover/title:text-[#191c20] transition-transform group-hover/title:translate-x-0.5 shrink-0" />
                              </div>
                              <p className="text-xs sm:text-sm text-[#44474e] mt-1 line-clamp-2 leading-relaxed">
                                {item.subtitle}
                              </p>
                            </div>

                            {/* Bottom Metadata & Action Buttons (Late & Pivot) */}
                            <div className="mt-3.5 pt-3 border-t border-[#e6ebf2] flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1 text-[#74777f] min-w-0 flex-1 truncate">
                                <Navigation className="w-3.5 h-3.5 shrink-0 text-[#0b57d0]" />
                                <span className="truncate text-xs">{item.locationName}</span>
                              </div>

                              {/* Only show Late / Pivot if stop is NOT completed and NOT passed */}
                              {!isCompleted && !isPassed && (
                                <div className="flex items-center gap-2 shrink-0">
                                  {/* Late Button (Shown on the active in-progress stop - M3 Tonal Button) */}
                                  {isInProgress && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const origTime = item.originalItem?.time || item.time;
                                        const origStartM = parseTimeToMinutes(origTime);
                                        const validStartM =
                                          origStartM > 0 ? origStartM : itemStartM > 0 ? itemStartM : nowMinutes;
                                        const computedDelay = Math.max(1, nowMinutes - validStartM);
                                        onRequestLate?.(item, computedDelay);
                                      }}
                                      title={isVi ? `Báo bị trễ cho ${item.title}` : `Report running late for ${item.title}`}
                                      className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#6e3900] bg-[#ffdcc2] hover:bg-[#ffcca6] border border-[#ffcca6] px-3 py-1.5 rounded-full transition-all active:scale-95 whitespace-nowrap shadow-xs"
                                    >
                                      <Clock className="w-3 h-3 text-[#6e3900] shrink-0" />
                                      <span>{t.timeline.imLate}</span>
                                    </button>
                                  )}

                                  {/* Pivot Stop Button (M3 Outlined Button) */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRequestPivotForStop(item);
                                    }}
                                    title={isVi ? 'Đổi hoặc chuyển đổi điểm dừng này' : 'Renegotiate or swap this stop'}
                                    className="shrink-0 inline-flex items-center gap-1 text-xs font-semibold text-[#0b57d0] hover:bg-[#d3e3fd]/40 border border-[#74777f]/40 px-3 py-1.5 rounded-full transition-all active:scale-95 whitespace-nowrap"
                                  >
                                    <Sparkles className="w-3 h-3 text-[#0b57d0] shrink-0" />
                                    <span className="whitespace-nowrap">{t.timeline.pivotStop}</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
          {/* Closing tag for timeline list column */}
          </div>
        )}

        {/* RIGHT / SECONDARY COLUMN: DESKTOP MAP PANEL (Visible in Split & Map modes) */}
        {desktopViewMode !== 'list' && (
          <div className={`${desktopViewMode === 'split' ? 'hidden lg:block lg:col-span-5 lg:sticky lg:top-20 lg:self-start' : 'hidden lg:block w-full'}`}>
            <ItineraryMap
              items={items}
              activeDayNumber={activeMapDay}
              totalDays={totalDaysCount}
              onDayChange={setActiveMapDay}
              selectedItemId={selectedMapItemId}
              onCenteringComplete={() => setSelectedMapItemId(null)}
              inProgressItemId={inProgressItemId}
              completedItemIds={completedItemIds}
              onSelectItem={onSelectItem}
              destinationName={destinationName}
              className={desktopViewMode === 'map' ? 'h-[calc(100vh-10rem)] min-h-[640px] shadow-md' : 'h-[calc(100vh-6.5rem)] min-h-[520px] shadow-md'}
            />
          </div>
        )}
      </div>
    </div>
  );
};
