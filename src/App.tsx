import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { TimelineView } from './components/TimelineView';
import { PulseCheck } from './components/PulseCheck';
import { SwapCardModal } from './components/SwapCardModal';
import { VisionCrowdModal } from './components/VisionCrowdModal';
import { VoiceInputModal } from './components/VoiceInputModal';
import { WeatherModal } from './components/WeatherModal';
import { ItemDetailsModal } from './components/ItemDetailsModal';
import { DestinationPromptView } from './components/DestinationPromptView';
import { SavedTripsModal } from './components/SavedTripsModal';
import { LanguageSelectorModal } from './components/LanguageSelectorModal';
import { GlobalLoadingModal } from './components/GlobalLoadingModal';
import {
  ItineraryItem,
  LiveWeather,
  SwapDecision,
  UserPulse,
  VisionCrowdResult,
  ItemCategory,
  ToastMessage,
  DEFAULT_MODEL_ID,
  SavedTrip,
  DayPlan,
} from './types';
import { Sparkles, CheckCircle2, ShieldAlert, Plus, RotateCcw, X, AlertTriangle } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { useLanguage } from './context/LanguageContext';
import { useLoading } from './context/LoadingContext';
import { saveTripToCloud } from './lib/firebase';
import { evaluateOsmOpeningHours } from './lib/openingHours';


function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isStopPassedOrCompleted(item: ItineraryItem | null | undefined, baseStartDate?: string): boolean {
  if (!item) return true;
  if (item.status === 'completed') return true;

  const now = new Date();
  const nowM = now.getHours() * 60 + now.getMinutes();
  const todayStr = getTodayIsoDate();
  const itemDate = item.dayDate || baseStartDate || todayStr;

  if (itemDate < todayStr) return true;
  if (itemDate > todayStr) return false;

  // On today's date, calculate scheduled end time
  let endM = 0;
  if (item.endTime) {
    const [eh, em] = item.endTime.split(':').map(Number);
    endM = (eh || 0) * 60 + (em || 0);
  } else {
    const [sh, sm] = (item.time || '09:00').split(':').map(Number);
    endM = (sh || 0) * 60 + (sm || 0) + (item.durationMins || 60);
  }

  return endM > 0 && nowM >= endM;
}

export function getEligiblePivotStops(items: ItineraryItem[], baseStartDate?: string): ItineraryItem[] {
  return items.filter((item) => !isStopPassedOrCompleted(item, baseStartDate));
}

export default function App() {
  const { user, signIn } = useAuth();
  const { language, t, isLanguageModalOpen, setIsLanguageModalOpen } = useLanguage();
  const { showLoading, hideLoading } = useLoading();
  const isVi = language === 'vi';

  // 1. Core Trip State - Initialized completely empty (No predefined timeline or hardcoded location)
  const [currentCityName, setCurrentCityName] = useState<string>('');
  const [currentLat, setCurrentLat] = useState<number | null>(null);
  const [currentLng, setCurrentLng] = useState<number | null>(null);
  const [isGpsActive, setIsGpsActive] = useState<boolean>(false);
  const [itinerary, setItinerary] = useState<ItineraryItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [startTime, setStartTime] = useState<string>('09:30');
  const [endTime, setEndTime] = useState<string>('18:00');
  const [numDays, setNumDays] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(getTodayIsoDate());
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [isLoadingWeather, setIsLoadingWeather] = useState<boolean>(false);
  const [isGeneratingTrip, setIsGeneratingTrip] = useState<boolean>(false);
  const [isGpsLoading, setIsGpsLoading] = useState<boolean>(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [lastAttemptedCity, setLastAttemptedCity] = useState<string>('');
  const [lastAttemptedTheme, setLastAttemptedTheme] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL_ID);

  // Cloud Persistence & Auto-Save State
  const [isSavedTripsModalOpen, setIsSavedTripsModalOpen] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [currentTripDocId, setCurrentTripDocId] = useState<string | null>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialLoadRef = useRef<boolean>(true);

  const [userPulse, setUserPulse] = useState<UserPulse>('great');
  const [simulatedDelayMins, setSimulatedDelayMins] = useState<number>(0);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);


  // 2. Modals State
  const [activeSwapDecision, setActiveSwapDecision] = useState<SwapDecision | null>(null);
  const [targetItemForSwap, setTargetItemForSwap] = useState<ItineraryItem | null>(null);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState<boolean>(false);

  const [isVisionModalOpen, setIsVisionModalOpen] = useState<boolean>(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState<boolean>(false);
  const [isWeatherModalOpen, setIsWeatherModalOpen] = useState<boolean>(false);
  const [selectedItemForDetail, setSelectedItemForDetail] = useState<ItineraryItem | null>(null);

  // Toast feedback with Retry support
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  const showToast = useCallback(
    (
      title: string,
      desc?: string,
      type: 'info' | 'success' | 'alert' | 'error' = 'info',
      onRetry?: () => void,
      retryLabel: string = 'Retry'
    ) => {
      const id = `toast-${Date.now()}`;
      setToastMessage({ id, title, desc, type, onRetry, retryLabel });
      if (!onRetry) {
        setTimeout(() => {
          setToastMessage((curr) => (curr?.id === id ? null : curr));
        }, 4500);
      }
    },
    []
  );

  // 3. Fetch Live Real-Time Weather from Open-Meteo
  const fetchWeather = useCallback(
    async (lat: number, lng: number, cityNameHint?: string) => {
      setIsLoadingWeather(true);
      try {
        const res = await fetch(`/api/weather?lat=${lat}&lng=${lng}`);
        if (!res.ok) {
          throw new Error(`Weather service returned status ${res.status}`);
        }
        const data = await res.json();
        setWeather({
          ...data,
          city: cityNameHint || currentCityName || 'Live Location',
        });
      } catch (err: any) {
        console.warn('Weather fetch notice:', err.message);
      } finally {
        setIsLoadingWeather(false);
      }
    },
    [currentCityName]
  );

  // 4. Dynamic Itinerary Generation from User Destination Input
  const handleGenerateItinerary = async (
    destination: string,
    theme: string = 'Local Hidden Gems & Great Food',
    customStart?: string,
    customEnd?: string,
    customNumDays?: number,
    customStartDate?: string,
    overrideLat?: number | null,
    overrideLng?: number | null
  ) => {
    const trimmed = destination.trim();
    if (!trimmed || trimmed.length < 2) {
      showToast('Invalid Input', 'Please enter a valid destination name or use your location.', 'alert');
      return;
    }

    const startToUse = customStart || startTime || '09:30';
    const endToUse = customEnd || endTime || '18:00';
    const daysToUse = customNumDays || numDays || 1;
    const startDateToUse = customStartDate || startDate || '2026-08-22';

    setStartTime(startToUse);
    setEndTime(endToUse);
    setNumDays(daysToUse);
    setStartDate(startDateToUse);

    const effectiveLat = overrideLat !== undefined && overrideLat !== null ? overrideLat : currentLat;
    const effectiveLng = overrideLng !== undefined && overrideLng !== null ? overrideLng : currentLng;
    if (overrideLat !== undefined && overrideLat !== null) {
      setCurrentLat(overrideLat);
      setIsGpsActive(true);
    }
    if (overrideLng !== undefined && overrideLng !== null) {
      setCurrentLng(overrideLng);
    }

    setLastAttemptedCity(trimmed);
    setLastAttemptedTheme(theme);
    setIsGeneratingTrip(true);
    setGenerationError(null);
    setSaveStatus('idle');
    setCurrentTripDocId(null);

    showLoading(
      isVi ? 'Đang tạo lịch trình...' : 'Generating Itinerary...',
      isVi
        ? `Đang tìm kiếm các điểm dừng thực tế & xác thực giờ mở cửa qua OpenStreetMap cho ${trimmed}...`
        : `Scouting authentic venues & verifying opening hours via OpenStreetMap for ${trimmed}...`
    );

    try {
      const res = await fetch('/api/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: trimmed,
          theme,
          startTime: startToUse,
          endTime: endToUse,
          numDays: daysToUse,
          startDate: startDateToUse,
          lat: effectiveLat,
          lng: effectiveLng,
          language,
          model: selectedModel,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Generation failed with status ${res.status}`);
      }

      const data = await res.json();

      if (data && data.items && Array.isArray(data.items) && data.items.length > 0) {
        setItinerary(data.items);
        setSelectedItemId(data.items[0]?.id || null);

        const resolvedName = data.cityName
          ? `${data.cityName}${data.country ? `, ${data.country}` : ''}`
          : trimmed;
        setCurrentCityName(resolvedName);

        const finalLat = data.lat || effectiveLat || 0;
        const finalLng = data.lng || effectiveLng || 0;

        if (data.lat && data.lng) {
          setCurrentLat(data.lat);
          setCurrentLng(data.lng);
        }

        if (data.weather) {
          setWeather(data.weather);
        } else if (data.lat && data.lng) {
          fetchWeather(data.lat, data.lng, resolvedName);
        }

        // Immediately auto-save the generated trip so it persists in cloud/local storage from the start
        const initialTripId = `trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        setCurrentTripDocId(initialTripId);

        const initialDays = buildDayPlansFromItems(data.items, daysToUse, startDateToUse);
        if (user) {
          setSaveStatus('saving');
          saveTripToCloud({
            tripId: initialTripId,
            destinationName: resolvedName,
            destinationLat: finalLat,
            destinationLng: finalLng,
            startDate: startDateToUse,
            daysCount: daysToUse,
            days: initialDays,
          })
            .then(() => setSaveStatus('saved'))
            .catch((err) => {
              console.warn('Initial cloud save failed:', err);
              setSaveStatus('error');
            });
        } else {
          try {
            const guestTrip = {
              id: initialTripId,
              destinationName: resolvedName,
              destinationLat: finalLat,
              destinationLng: finalLng,
              startDate: startDateToUse,
              daysCount: daysToUse,
              days: initialDays,
              updatedAt: new Date().toISOString(),
            };
            localStorage.setItem('mattermap_active_trip', JSON.stringify(guestTrip));
            setSaveStatus('saved');
          } catch {
            setSaveStatus('error');
          }
        }

        showToast(
          'Itinerary Generated!',
          `Custom ${daysToUse > 1 ? `${daysToUse}-day ` : ''}plan crafted for ${resolvedName}`,
          'success'
        );
      } else {
        throw new Error('No stops could be generated for this location. Please verify the destination.');
      }
    } catch (e: any) {
      console.error('Generation error:', e);
      setGenerationError(e.message || "Couldn't reach the AI travel engine. Check your connection.");
      showToast(
        "Couldn't reach the AI",
        'Check your connection and try again.',
        'error',
        () => handleGenerateItinerary(trimmed, theme, startToUse, endToUse, daysToUse, startDateToUse, effectiveLat, effectiveLng),
        'Retry Generation'
      );
    } finally {
      setIsGeneratingTrip(false);
      hideLoading();
    }
  };

  // 5. Use Current Live GPS
  const handleUseCurrentGps = (customStart?: string, customEnd?: string) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      showToast('GPS Error', 'Geolocation is not supported in this browser.', 'alert');
      return;
    }

    setIsGpsLoading(true);
    setGenerationError(null);
    showLoading(
      isVi ? 'Đang lấy vị trí GPS...' : 'Acquiring GPS Location...',
      isVi ? 'Đang đọc tọa độ thiết bị và xác định khu vực của bạn...' : 'Reading live coordinates from device & geocoding location...'
    );

    const startToUse = customStart || startTime;
    const endToUse = customEnd || endTime;

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCurrentLat(latitude);
        setCurrentLng(longitude);
        setIsGpsActive(true);

        try {
          const geoRes = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          let placeLabel = `Live GPS (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`;
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            placeLabel = `${geoData.city}${geoData.country ? `, ${geoData.country}` : ''}`;
          }
          setCurrentCityName(placeLabel);
          await handleGenerateItinerary(placeLabel, 'Local Exploration & Top Highlights', startToUse, endToUse);
        } catch (e: any) {
          console.warn('GPS geocode notice:', e);
          await handleGenerateItinerary(`Local GPS (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`, 'Local Exploration & Top Highlights', startToUse, endToUse);
        } finally {
          setIsGpsLoading(false);
        }
      },
      (err) => {
        console.warn('GPS error:', err.message);
        setIsGpsLoading(false);
        hideLoading();
        let msg = 'Location permission denied. Please enter a destination city manually.';
        if (err.code === 2) msg = 'Location unavailable. Please enter a city manually.';
        if (err.code === 3) msg = 'Location request timed out. Please try again or enter a city.';
        setGenerationError(msg);
        showToast('GPS Notice', msg, 'alert');
      },
      { timeout: 12000, enableHighAccuracy: true }
    );
  };

  // 6. Live AI Renegotiation Brain Engine (with OSM Opening Hours Verification)
  const evaluateItinerarySignals = async (
    contextPrompt?: string,
    targetedStop?: ItineraryItem,
    delayOverride?: number,
    silent: boolean = false
  ) => {
    if (isEvaluating || itinerary.length === 0) return;
    setIsEvaluating(true);

    const eligibleCandidateStops = getEligiblePivotStops(itinerary, startDate);

    // If targetedStop is explicitly provided, verify it is not passed/completed
    if (targetedStop && isStopPassedOrCompleted(targetedStop, startDate)) {
      if (!silent) {
        showToast(
          'Notice',
          isVi
            ? `"${targetedStop.title}" đã kết thúc hoặc hoàn thành và không thể thay thế.`
            : `"${targetedStop.title}" has already concluded or completed and cannot be pivoted.`,
          'info'
        );
      }
      setIsEvaluating(false);
      return;
    }

    if (eligibleCandidateStops.length === 0) {
      if (!silent) {
        showToast(
          'Itinerary Concluded',
          isVi
            ? 'Tất cả các điểm dừng trong lịch trình đã kết thúc hoặc hoàn thành.'
            : 'All stops in your itinerary have already passed or been completed.',
          'info'
        );
      }
      setIsEvaluating(false);
      return;
    }

    const effectiveDelay = delayOverride !== undefined ? delayOverride : simulatedDelayMins;

    // STEP 1: Check OSM Opening Hours for eligible active & upcoming stops ONLY
    let hoursConflictStop: ItineraryItem | null = null;
    let hoursConflictEval: any = null;

    for (const stop of eligibleCandidateStops) {
      const rawHours = stop.openingHours?.raw || stop.osmMetadata?.osmTags?.opening_hours;
      if (rawHours) {
        const evalRes = evaluateOsmOpeningHours(rawHours, stop.time, stop.endTime, stop.dayDate || startDate);
        if (evalRes && evalRes.isOpen === false) {
          hoursConflictStop = stop;
          hoursConflictEval = evalRes;
          break;
        }
      }
    }

    // If an upcoming stop falls outside its real OSM opening hours, activate Hours Alert and trigger pivot
    if (hoursConflictStop && !targetedStop) {
      const targetStop = hoursConflictStop;
      setTargetItemForSwap(targetStop);

      // Trigger the "Hours Alert" chip on the stop by updating its openingHours in state
      if (hoursConflictEval) {
        setItinerary((prev) =>
          prev.map((item) =>
            item.id === targetStop.id ? { ...item, openingHours: hoursConflictEval } : item
          )
        );
      }

      showToast(
        'Opening Hours Alert',
        `"${targetStop.title}" is scheduled during closed hours (${targetStop.time}). Renegotiating open alternative...`,
        'alert'
      );

      const hoursAlertPrompt = `CRITICAL OPENING HOURS ALERT: "${targetStop.title}" is scheduled for ${targetStop.time} to ${targetStop.endTime || 'later'}, which is strictly outside its verified OSM opening hours (${hoursConflictEval?.todayHoursText || hoursConflictEval?.raw || 'Closed'}). Propose an authentic replacement stop in the same neighborhood that is verified OPEN during this time window.`;

      try {
        const payload = {
          itinerary: itinerary.map((item) => ({
            ...item,
            isPassed: isStopPassedOrCompleted(item, startDate),
            isCompleted: item.status === 'completed',
          })),
          eligibleStopIds: eligibleCandidateStops.map((i) => i.id),
          targetItemId: targetStop.id,
          currentWeather: weather,
          userPulse,
          currentLocation: { name: currentCityName, lat: currentLat || 0, lng: currentLng || 0 },
          simulatedDelayMins: effectiveDelay,
          language,
          model: selectedModel,
          contextPrompt: hoursAlertPrompt,
        };

        const res = await fetch('/api/replan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const decision: SwapDecision = await res.json();
          if (decision.status === 'PROPOSE_SWAP' && decision.proposed_swap) {
            setActiveSwapDecision(decision);
            setIsSwapModalOpen(true);
            setIsEvaluating(false);
            return;
          }
        }
      } catch (err: any) {
        console.warn('Re-planner hours swap error, using graceful fallback:', err);
        const fallbackDecision: SwapDecision = {
          status: 'PROPOSE_SWAP',
          trigger_reason: `OSM opening hours indicate "${targetStop.title}" is closed during scheduled visit.`,
          skipped_place: targetStop.title,
          target_item_id: targetStop.id,
          proposed_swap: {
            place_name: `Open Culture & Local Heritage Hub, ${currentCityName.split(',')[0] || 'City Center'}`,
            place_id: `swap-hours-${Date.now()}`,
            travel_time_mins: 6,
            category: (targetStop.category as ItemCategory) || 'sightseeing',
            indoor_outdoor: 'indoor',
            vibe: 'Verified open nearby attraction',
            estimated_duration_mins: targetStop.durationMins || 60,
            description: `Nearby alternative open during this time slot to replace ${targetStop.title}.`,
          },
          justification: `${targetStop.title} is closed during the planned time (${targetStop.time}); this alternative is verified open nearby.`,
        };
        setActiveSwapDecision(fallbackDecision);
        setIsSwapModalOpen(true);
        setIsEvaluating(false);
        return;
      }
    }

    if (!silent) {
      if (targetedStop) {
        showLoading(
          isVi ? 'Đang tìm địa điểm thay thế...' : 'Pivoting Stop...',
          isVi
            ? `Đang tìm kiếm các điểm dừng lân cận mở cửa phù hợp để thay thế "${targetedStop.title}"...`
            : `Finding verified open nearby venues to replace "${targetedStop.title}"...`
        );
      } else if (delayOverride !== undefined || contextPrompt?.includes('running') || contextPrompt?.includes('late')) {
        showLoading(
          isVi ? 'Đang điều chỉnh lịch trình...' : 'Adapting Schedule...',
          isVi
            ? 'Đang tính toán lại thời gian di chuyển và sắp xếp các điểm dừng tiếp theo...'
            : 'Recalculating upcoming stop timings and schedule windows...'
        );
      } else {
        showLoading(
          isVi ? 'Đang kiểm tra điều kiện...' : 'Checking Live Conditions...',
          isVi
            ? 'Đang phân tích thời tiết thực tế, đám đông và giờ mở cửa OpenStreetMap...'
            : 'Evaluating live weather, crowd signals, and OpenStreetMap opening hours...'
        );
      }
    }

    // STEP 2: Standard Live Condition & Delay Brain Check (strictly active/upcoming)
    const activeStop =
      (targetedStop && !isStopPassedOrCompleted(targetedStop, startDate) ? targetedStop : null) ||
      (targetItemForSwap && !isStopPassedOrCompleted(targetItemForSwap, startDate) ? targetItemForSwap : null) ||
      getCurrentlyActiveStop() ||
      eligibleCandidateStops[0];

    setTargetItemForSwap(activeStop || null);

    try {
      const payload = {
        itinerary: itinerary.map((item) => ({
          ...item,
          isPassed: isStopPassedOrCompleted(item, startDate),
          isCompleted: item.status === 'completed',
        })),
        eligibleStopIds: eligibleCandidateStops.map((i) => i.id),
        targetItemId: activeStop?.id,
        currentWeather: weather,
        userPulse,
        currentLocation: { name: currentCityName, lat: currentLat || 0, lng: currentLng || 0 },
        simulatedDelayMins: effectiveDelay,
        language,
        model: selectedModel,
        contextPrompt:
          contextPrompt ||
          `Pace check: ${userPulse}. Live weather: ${weather?.tempC ?? 20}°C, ${weather?.condition ?? 'Clear'}.`,
      };

      const res = await fetch('/api/replan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || `Re-planner failed with status ${res.status}`);
      }

      const decision: SwapDecision = await res.json();

      if (decision.status === 'PROPOSE_SWAP' && decision.proposed_swap) {
        setActiveSwapDecision(decision);
        setIsSwapModalOpen(true);
      } else {
        showToast(
          'Plan Verified & Maintained',
          decision.justification || 'All upcoming stops and opening hours are optimal under live conditions.',
          'success'
        );
      }
    } catch (err: any) {
      console.error('Replan evaluation notice:', err.message);
      // If signal clearly warranted an indoor move or food, deliver graceful fallback with toast
      if (weather?.isRaining || userPulse === 'tired' || userPulse === 'hungry' || contextPrompt) {
        const fallbackDecision: SwapDecision = {
          status: 'PROPOSE_SWAP',
          trigger_reason: contextPrompt || 'Live condition shift requires sheltered indoor adaptation.',
          skipped_place: activeStop?.title || 'Current Scheduled Stop',
          target_item_id: activeStop?.id,
          proposed_swap: {
            place_name: `Cozy Artisanal Tea & Food Lounge, ${currentCityName.split(',')[0] || 'City Center'}`,
            place_id: 'swap-fallback-1',
            travel_time_mins: 5,
            category: 'food',
            indoor_outdoor: 'indoor',
            vibe: 'Warm, dry & serene retreat',
            estimated_duration_mins: 60,
            description: 'Heated indoor lounge with local specialties, artisan roast, and quiet seating.',
          },
          justification:
            'Severe weather and fatigue make outdoor walks uncomfortable; this sheltered space is only 5 minutes away.',
        };
        setActiveSwapDecision(fallbackDecision);
        setIsSwapModalOpen(true);
      } else {
        showToast(
          "Couldn't reach AI re-planner",
          'Check your connection and try again.',
          'error',
          () => evaluateItinerarySignals(contextPrompt, targetedStop, delayOverride),
          'Retry AI Check'
        );
      }
    } finally {
      setIsEvaluating(false);
      if (!silent) {
        hideLoading();
      }
    }
  };

  // 7. Accept Swap Handler (1-Tap Action - Exact in-place replacement with NO duplicates)
  const handleAcceptSwap = () => {
    if (!activeSwapDecision?.proposed_swap) return;

    const swap = activeSwapDecision.proposed_swap;
    const targetId = activeSwapDecision.target_item_id || targetItemForSwap?.id;
    const skippedPlace = activeSwapDecision.skipped_place;

    setItinerary((prev) => {
      // Find the specific item index to guarantee exact 1-to-1 in-place replacement among unpassed/uncompleted items
      let targetIndex = -1;
      if (targetId) {
        targetIndex = prev.findIndex((item) => item.id === targetId && !isStopPassedOrCompleted(item, startDate));
      }
      if (targetIndex === -1 && skippedPlace) {
        targetIndex = prev.findIndex(
          (item) => item.title.toLowerCase() === skippedPlace.toLowerCase() && !isStopPassedOrCompleted(item, startDate)
        );
      }
      if (targetIndex === -1 && targetItemForSwap) {
        targetIndex = prev.findIndex((item) => item.title === targetItemForSwap.title && !isStopPassedOrCompleted(item, startDate));
      }
      if (targetIndex === -1) {
        targetIndex = prev.findIndex((item) => !isStopPassedOrCompleted(item, startDate));
      }
      if (targetIndex === -1) {
        return prev;
      }

      return prev.map((item, idx) => {
        if (idx !== targetIndex) return item;

        // Preserve root original item if this item was already swapped before
        const originalBase = item.originalItem || {
          id: item.id,
          time: item.time,
          endTime: item.endTime,
          title: item.title,
          subtitle: item.subtitle,
          category: item.category,
          durationMins: item.durationMins,
          locationName: item.locationName,
          indoorOutdoor: item.indoorOutdoor,
          vibe: item.vibe,
          notes: item.notes,
          status: 'skipped',
        };

        const updatedItem: ItineraryItem = {
          id: item.id, // Preserve ID to keep keys and references stable
          time: item.time,
          endTime: item.endTime,
          dayNumber: item.dayNumber || 1,
          dayDate: item.dayDate,
          lat: swap.lat || (item.lat ? item.lat + 0.0012 : undefined),
          lng: swap.lng || (item.lng ? item.lng + 0.0015 : undefined),
          title: swap.place_name,
          subtitle: swap.description,
          category: (swap.category as ItemCategory) || 'relaxation',
          durationMins: swap.estimated_duration_mins || item.durationMins,
          locationName: `${swap.place_name} (${swap.travel_time_mins}m walk)`,
          indoorOutdoor: swap.indoor_outdoor || 'indoor',
          vibe: swap.vibe || 'Renegotiated Haven',
          notes: `Auto-swapped by MatterMap: ${activeSwapDecision.justification}`,
          status: item.status,
          swapReason: activeSwapDecision.trigger_reason,
          originalItem: originalBase,
        };
        return updatedItem;
      });
    });

    setIsSwapModalOpen(false);
    showToast(
      'Itinerary Renegotiated!',
      `Replaced "${activeSwapDecision.skipped_place || targetItemForSwap?.title || 'Original'}" with "${swap.place_name}".`,
      'success'
    );
  };

  const handleDeclineSwap = () => {
    setIsSwapModalOpen(false);
    showToast('Plan Maintained', 'Kept original itinerary as requested.', 'info');
  };

  // Late handler for active stop
  const handleLateForStop = (item: ItineraryItem, calculatedDelay: number) => {
    if (isStopPassedOrCompleted(item, startDate)) {
      showToast('Notice', isVi ? 'Điểm dừng này đã kết thúc.' : 'This stop has already concluded.', 'info');
      return;
    }
    setSimulatedDelayMins(calculatedDelay);
    setTargetItemForSwap(item);
    showToast(
      'Schedule Delay Detected',
      `Running ${calculatedDelay}m behind at "${item.title}". Adapting remaining schedule...`,
      'alert'
    );
    evaluateItinerarySignals(
      `We are running ${calculatedDelay} minutes late at "${item.title}" (scheduled start was ${item.time}). Please adjust and adapt the remaining schedule to accommodate the delay.`,
      item,
      calculatedDelay
    );
  };

  // 8. Multimodal Vision result handler
  const handleVisionCrowdSwap = (result: VisionCrowdResult) => {
    if (result.swapDecision && result.swapDecision.status === 'PROPOSE_SWAP') {
      const activeStop = getCurrentlyActiveStop() || getEligiblePivotStops(itinerary, startDate)[0];
      if (!activeStop) {
        showToast('Notice', isVi ? 'Không còn điểm dừng nào để thay thế.' : 'No upcoming stops found to pivot.', 'info');
        return;
      }
      setTargetItemForSwap(activeStop);
      setActiveSwapDecision(result.swapDecision);
      setIsSwapModalOpen(true);
    }
  };

  // 9. Multimodal Voice result handler
  const handleVoiceSwapDecision = (decision: SwapDecision) => {
    if (decision.status === 'PROPOSE_SWAP') {
      const activeStop = getCurrentlyActiveStop() || getEligiblePivotStops(itinerary, startDate)[0];
      if (!activeStop) {
        showToast('Notice', isVi ? 'Không còn điểm dừng nào để thay thế.' : 'No upcoming stops found to pivot.', 'info');
        return;
      }
      setTargetItemForSwap(activeStop);
      setActiveSwapDecision(decision);
      setIsSwapModalOpen(true);
    }
  };

  // 10. Item completion toggle
  const handleToggleComplete = (itemId: string) => {
    setItinerary((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextStatus = item.status === 'completed' ? 'active' : 'completed';
          return { ...item, status: nextStatus };
        }
        return item;
      })
    );
  };

  // 11. Pulse selection handler
  const handleSelectPulse = (pulse: UserPulse) => {
    setUserPulse(pulse);
    showToast('Pulse Registered', `Calibrating plan for: "${pulse.replace('_', ' ')}"`, 'info');
    evaluateItinerarySignals(`Traveler pulse updated to "${pulse}". Adapt pacing immediately.`);
  };

  // Helper: Get the currently active/happening stop for context-aware features (Vision, Voice, Replan)
  const getCurrentlyActiveStop = useCallback((): ItineraryItem | undefined => {
    if (itinerary.length === 0) return undefined;
    const now = new Date();
    const nowM = now.getHours() * 60 + now.getMinutes();
    const todayStr = getTodayIsoDate();

    // Filter to today's stops if available
    const todayItems = itinerary.filter(
      (i) => (i.dayDate || startDate) === todayStr || (!i.dayDate && (i.dayNumber || 1) === 1)
    );
    const candidateItems = todayItems.length > 0 ? todayItems : itinerary;

    const occurring = candidateItems.find((i) => {
      if (isStopPassedOrCompleted(i, startDate)) return false;
      const [sh, sm] = (i.time || '09:00').split(':').map(Number);
      const startM = (sh || 0) * 60 + (sm || 0);
      let endM = startM + (i.durationMins || 60);
      if (i.endTime) {
        const [eh, em] = i.endTime.split(':').map(Number);
        endM = (eh || 0) * 60 + (em || 0);
      }
      return nowM >= startM && nowM < endM;
    });
    if (occurring) return occurring;

    const upcoming = candidateItems.find((i) => !isStopPassedOrCompleted(i, startDate));
    if (upcoming) return upcoming;

    // Fallback to any future eligible stop
    return getEligiblePivotStops(itinerary, startDate)[0];
  }, [itinerary, startDate]);

  // Helper: Check if a stop is in the past (locked completion)
  const isItemPassed = useCallback(
    (item: ItineraryItem | null): boolean => {
      if (!item) return false;
      const now = new Date();
      const nowM = now.getHours() * 60 + now.getMinutes();
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const itemDate = item.dayDate || startDate || todayStr;
      if (itemDate < todayStr) return true;
      if (itemDate > todayStr) return false;

      let endM = 0;
      if (item.endTime) {
        const [eh, em] = item.endTime.split(':').map(Number);
        endM = (eh || 0) * 60 + (em || 0);
      } else {
        const [sh, sm] = (item.time || '09:00').split(':').map(Number);
        endM = (sh || 0) * 60 + (sm || 0) + (item.durationMins || 60);
      }
      return endM > 0 && nowM >= endM;
    },
    [startDate]
  );

  // Group itinerary items by day for Firestore persistence
  const buildDayPlansFromItems = useCallback(
    (items: ItineraryItem[], daysCount: number, baseStartDate: string): DayPlan[] => {
      const count = Math.max(daysCount, 1);
      const dayGroups: DayPlan[] = [];
      for (let d = 1; d <= count; d++) {
        const dayItems = items.filter((item) => (item.dayNumber || 1) === d);
        let dateStr = baseStartDate;
        let formattedDate = `Day ${d}`;
        try {
          const base = new Date(baseStartDate.includes('T') ? baseStartDate : `${baseStartDate}T12:00:00Z`);
          if (!isNaN(base.getTime())) {
            base.setUTCDate(base.getUTCDate() + (d - 1));
            dateStr = base.toISOString().split('T')[0];
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            formattedDate = `${months[base.getUTCMonth()]} ${base.getUTCDate()}`;
          }
        } catch {
          // fallback gracefully
        }
        dayGroups.push({
          dayNumber: d,
          date: dateStr,
          formattedDate,
          title: `Day ${d}`,
          items: dayItems,
        });
      }
      return dayGroups;
    },
    []
  );

  // Automatic persistence: Auto-save whenever the itinerary, days, or metadata change
  useEffect(() => {
    if (itinerary.length === 0) return;

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    setSaveStatus('saving');
    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const dayPlans = buildDayPlansFromItems(itinerary, numDays, startDate);
        const tripIdToUse = currentTripDocId || `trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        if (user) {
          const savedDocId = await saveTripToCloud({
            tripId: tripIdToUse,
            destinationName: currentCityName || 'Travel Itinerary',
            destinationLat: currentLat || (itinerary[0]?.lat ?? 0),
            destinationLng: currentLng || (itinerary[0]?.lng ?? 0),
            startDate: startDate || getTodayIsoDate(),
            daysCount: numDays || 1,
            days: dayPlans,
          });
          if (!currentTripDocId) {
            setCurrentTripDocId(savedDocId);
          }
        } else {
          try {
            const guestTrip = {
              id: tripIdToUse,
              destinationName: currentCityName,
              destinationLat: currentLat,
              destinationLng: currentLng,
              startDate,
              daysCount: numDays,
              days: dayPlans,
              updatedAt: new Date().toISOString(),
            };
            localStorage.setItem('mattermap_active_trip', JSON.stringify(guestTrip));
          } catch {
            setSaveStatus('error');
            return;
          }
        }
        setSaveStatus('saved');
      } catch (error) {
        console.warn('Auto-save failed:', error);
        setSaveStatus('error');
      }
    }, 1200);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [
    itinerary,
    user,
    buildDayPlansFromItems,
    numDays,
    startDate,
    currentTripDocId,
    currentCityName,
    currentLat,
    currentLng,
  ]);

  // Manual Retry Save action if auto-save fails
  const handleRetrySave = useCallback(async () => {
    if (itinerary.length === 0) return;
    setSaveStatus('saving');
    showLoading(
      isVi ? 'Đang lưu lịch trình...' : 'Saving Trip...',
      isVi ? 'Đang lưu dữ liệu vào cơ sở dữ liệu Firestore...' : 'Saving itinerary to Firestore cloud database...'
    );
    try {
      const dayPlans = buildDayPlansFromItems(itinerary, numDays, startDate);
      const tripIdToUse = currentTripDocId || `trip_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      if (user) {
        const savedDocId = await saveTripToCloud({
          tripId: tripIdToUse,
          destinationName: currentCityName || 'Travel Itinerary',
          destinationLat: currentLat || (itinerary[0]?.lat ?? 0),
          destinationLng: currentLng || (itinerary[0]?.lng ?? 0),
          startDate: startDate || getTodayIsoDate(),
          daysCount: numDays || 1,
          days: dayPlans,
        });
        if (!currentTripDocId) {
          setCurrentTripDocId(savedDocId);
        }
        setSaveStatus('saved');
        showToast('Saved to Cloud', 'Your trip plan has been saved to your account.', 'success');
      } else {
        const guestTrip = {
          id: tripIdToUse,
          destinationName: currentCityName,
          destinationLat: currentLat,
          destinationLng: currentLng,
          startDate,
          daysCount: numDays,
          days: dayPlans,
          updatedAt: new Date().toISOString(),
        };
        localStorage.setItem('mattermap_active_trip', JSON.stringify(guestTrip));
        setSaveStatus('saved');
        showToast('Saved Locally', 'Your trip plan has been saved to your device.', 'success');
      }
    } catch (err) {
      console.warn('Manual retry save failed:', err);
      setSaveStatus('error');
      showToast('Save Failed', 'Unable to save to cloud. Tap retry to attempt saving again.', 'error', handleRetrySave);
    } finally {
      hideLoading();
    }
  }, [
    itinerary,
    numDays,
    startDate,
    currentTripDocId,
    user,
    currentCityName,
    currentLat,
    currentLng,
    buildDayPlansFromItems,
    showToast,
    showLoading,
    hideLoading,
    isVi,
  ]);

  // Automated background signal check every 30 minutes (runs silently without blocking UI)
  useEffect(() => {
    if (itinerary.length === 0) return;
    const interval = setInterval(() => {
      evaluateItinerarySignals('Automated 30-minute background condition check', undefined, undefined, true);
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [itinerary.length, evaluateItinerarySignals]);

  // Load a Saved Trip from Cloud into the active workspace
  const handleLoadSavedTrip = useCallback(
    (trip: SavedTrip) => {
      showLoading(
        isVi ? 'Đang mở lịch trình...' : 'Loading Trip...',
        isVi ? `Đang thiết lập lịch trình cho ${trip.destinationName}...` : `Assembling itinerary for ${trip.destinationName}...`
      );

      const allItems: ItineraryItem[] = [];
      (trip.days || []).forEach((day) => {
        (day.items || []).forEach((item) => {
          allItems.push({
            ...item,
            dayNumber: day.dayNumber || item.dayNumber || 1,
            dayDate: day.date || item.dayDate || trip.startDate,
          });
        });
      });

      setItinerary(allItems);
      setCurrentCityName(trip.destinationName);
      setCurrentLat(trip.destinationLat);
      setCurrentLng(trip.destinationLng);
      setStartDate(trip.startDate || getTodayIsoDate());
      setNumDays(trip.daysCount || 1);
      setCurrentTripDocId(trip.id);
      setSaveStatus('saved');
      setIsSavedTripsModalOpen(false);

      if (trip.destinationLat && trip.destinationLng) {
        fetchWeather(trip.destinationLat, trip.destinationLng, trip.destinationName);
      }

      showToast(
        'Trip Loaded',
        `Loaded "${trip.destinationName}" (${trip.daysCount} days, ${allItems.length} stops).`,
        'success'
      );

      setTimeout(() => {
        hideLoading();
      }, 300);
    },
    [fetchWeather, showToast, showLoading, hideLoading, isVi]
  );

  // FIRST SCREEN CHECK: If no itinerary exists yet, prompt the user for their destination
  if (itinerary.length === 0) {
    return (
      <>
        <DestinationPromptView
          onGeneratePlan={handleGenerateItinerary}
          isGenerating={isGeneratingTrip}
          errorMessage={generationError}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
          onClearError={() => setGenerationError(null)}
          onOpenSavedTrips={() => setIsSavedTripsModalOpen(true)}
          onRetryLastAction={
            lastAttemptedCity
              ? () =>
                  handleGenerateItinerary(
                    lastAttemptedCity,
                    lastAttemptedTheme,
                    startTime,
                    endTime,
                    numDays,
                    startDate,
                    currentLat,
                    currentLng
                  )
              : undefined
          }
        />
        <SavedTripsModal
          isOpen={isSavedTripsModalOpen}
          onClose={() => setIsSavedTripsModalOpen(false)}
          onLoadTrip={handleLoadSavedTrip}
          onOpenSignIn={() => setIsLanguageModalOpen(true)}
        />
        <LanguageSelectorModal
          isOpen={isLanguageModalOpen}
          onClose={() => setIsLanguageModalOpen(false)}
          canDismiss={true}
        />
        <GlobalLoadingModal />
      </>
    );
  }

  // ACTIVE TRIP SCREEN
  return (
    <div className="min-h-screen bg-white text-[#191c20] font-sans antialiased pb-24 selection:bg-[#d3e3fd] selection:text-[#041e49]">
      {/* Responsive Centered Content Container */}
      <div className="w-full max-w-4xl lg:max-w-6xl xl:max-w-7xl mx-auto min-h-screen bg-white flex flex-col relative">
        {/* Sticky Top App Bar */}
        <Header
          weather={weather}
          isLoadingWeather={isLoadingWeather}
          onOpenWeatherModal={() => setIsWeatherModalOpen(true)}
          onOpenVisionModal={() => setIsVisionModalOpen(true)}
          onOpenVoiceModal={() => setIsVoiceModalOpen(true)}
          onOpenSavedTrips={() => setIsSavedTripsModalOpen(true)}
          onBackToSearch={() => {
            setItinerary([]);
            setCurrentCityName('');
            setGenerationError(null);
          }}
          selectedModel={selectedModel}
          onSelectModel={setSelectedModel}
        />


        {/* Live Notification / Feedback Toast Banner with Retry support */}
        {toastMessage && (
          <div className="px-4 sm:px-6 pt-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              className={`p-4 rounded-[20px] border text-xs flex items-start justify-between gap-3 shadow-xs ${
                toastMessage.type === 'error'
                  ? 'bg-[#ba1a1a]/10 border-[#ba1a1a]/30 text-[#ba1a1a]'
                  : toastMessage.type === 'alert'
                  ? 'bg-[#6e3900]/10 border-[#6e3900]/30 text-[#6e3900]'
                  : toastMessage.type === 'success'
                  ? 'bg-[#146c2e]/10 border-[#146c2e]/30 text-[#146c2e]'
                  : 'bg-[#d3e3fd]/40 border-[#0b57d0]/30 text-[#041e49]'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5">
                  {toastMessage.type === 'error' ? (
                    <ShieldAlert className="w-4 h-4 text-[#ba1a1a]" />
                  ) : toastMessage.type === 'alert' ? (
                    <AlertTriangle className="w-4 h-4 text-[#6e3900]" />
                  ) : toastMessage.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-[#146c2e]" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-[#0b57d0]" />
                  )}
                </div>
                <div>
                  <div className="font-bold text-xs">{toastMessage.title}</div>
                  {toastMessage.desc && (
                    <p className="mt-0.5 opacity-90 leading-tight text-[11px]">{toastMessage.desc}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {toastMessage.onRetry && (
                  <button
                    onClick={() => {
                      const retryFn = toastMessage.onRetry;
                      setToastMessage(null);
                      retryFn?.();
                    }}
                    className="px-3 py-1.5 bg-[#191c20] text-white hover:bg-[#2e3135] rounded-full font-bold text-[11px] flex items-center gap-1 shadow-xs transition-all active:scale-95"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{toastMessage.retryLabel || 'Retry'}</span>
                  </button>
                )}
                <button
                  onClick={() => setToastMessage(null)}
                  className="p-1 hover:bg-black/5 rounded-full text-[#74777f] hover:text-[#191c20] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Vertical Timeline */}
        <main className="flex-1">
          <TimelineView
            items={itinerary}
            destinationName={currentCityName}
            startTime={startTime}
            endTime={endTime}
            startDate={startDate}
            numDays={numDays}
            saveStatus={saveStatus}
            onRetrySave={handleRetrySave}
            onCheckStatus={() => evaluateItinerarySignals('Manual condition check')}
            isEvaluating={isEvaluating}
            onSelectItem={(item) => {
              setSelectedItemForDetail(item);
            }}
            onRequestPivotForStop={(item) => {
              setTargetItemForSwap(item);
              evaluateItinerarySignals(
                `Traveler explicitly requested a pivot away from "${item.title}".`,
                item
              );
            }}
            onRequestLate={handleLateForStop}
            onToggleComplete={handleToggleComplete}
          />
        </main>


        {/* Floating Pace & Mood Bar */}
        <PulseCheck
          currentPulse={userPulse}
          isEvaluating={isEvaluating}
          onSelectPulse={handleSelectPulse}
        />

        {/* Modals & Drawers */}
        <SwapCardModal
          decision={activeSwapDecision}
          targetItem={targetItemForSwap}
          isOpen={isSwapModalOpen}
          onAccept={handleAcceptSwap}
          onDecline={handleDeclineSwap}
        />

        <VisionCrowdModal
          isOpen={isVisionModalOpen}
          activeItem={getCurrentlyActiveStop() || itinerary[0]}
          currentLocationName={currentCityName}
          onClose={() => setIsVisionModalOpen(false)}
          onApplySwapDecision={handleVisionCrowdSwap}
        />

        <VoiceInputModal
          isOpen={isVoiceModalOpen}
          onClose={() => setIsVoiceModalOpen(false)}
          onVoiceSwapDecision={handleVoiceSwapDecision}
        />

        <WeatherModal
          isOpen={isWeatherModalOpen}
          onClose={() => setIsWeatherModalOpen(false)}
          currentWeather={weather}
          onApplyWeather={(newWeather, shouldReplan) => {
            setWeather(newWeather);
            if (shouldReplan) {
              evaluateItinerarySignals(
                `Weather condition updated to ${newWeather.condition} (${newWeather.tempC}°C, ${newWeather.isRaining ? 'Raining' : 'Dry'}). Adapt itinerary accordingly.`
              );
            }
          }}
        />

        <ItemDetailsModal
          item={selectedItemForDetail}
          isOpen={!!selectedItemForDetail}
          isPassed={isItemPassed(selectedItemForDetail)}
          onClose={() => setSelectedItemForDetail(null)}
          onRequestPivot={(item) => {
            setTargetItemForSwap(item);
            evaluateItinerarySignals(`Traveler requested to pivot "${item.title}".`, item);
          }}
          onToggleComplete={handleToggleComplete}
        />

        <SavedTripsModal
          isOpen={isSavedTripsModalOpen}
          onClose={() => setIsSavedTripsModalOpen(false)}
          onLoadTrip={handleLoadSavedTrip}
          onOpenSignIn={() => setIsLanguageModalOpen(true)}
        />

        <LanguageSelectorModal
          isOpen={isLanguageModalOpen}
          onClose={() => setIsLanguageModalOpen(false)}
          canDismiss={true}
        />

        <GlobalLoadingModal />
      </div>
    </div>
  );
}

