import React, { useState, useEffect, useRef } from 'react';
import {
  MapPin,
  Navigation,
  Sparkles,
  ArrowRight,
  Compass,
  RefreshCw,
  Coffee,
  Landmark,
  Trees,
  UtensilsCrossed,
  ShieldCheck,
  Zap,
  AlertCircle,
  RotateCcw,
  Clock,
  Calendar,
  Plus,
  Minus,
  Check,
  Loader2,
  X,
  FolderHeart,
  LogIn,
  LogOut,
  User as UserIcon,
  Bot,
  Globe,
} from 'lucide-react';
import { ModelSelector } from './ModelSelector';
import {
  searchPhotonPlaces,
  GeocodedPlaceSuggestion,
  PRESET_DESTINATIONS,
} from '../lib/photon';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';

interface DestinationPromptViewProps {
  onGeneratePlan: (
    destination: string,
    theme: string,
    startTime: string,
    endTime: string,
    numDays: number,
    startDate: string,
    lat?: number | null,
    lng?: number | null
  ) => Promise<void>;
  isGenerating: boolean;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  errorMessage?: string | null;
  onClearError?: () => void;
  onRetryLastAction?: () => void;
  onOpenSavedTrips?: () => void;
}

function timeToMinutes(t: string): number {
  if (!t || !t.includes(':')) return 0;
  const [h, m] = t.split(':').map((x) => parseInt(x, 10) || 0);
  return h * 60 + m;
}

function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateRange(startDateStr: string, daysCount: number, isVi: boolean): string {
  try {
    const base = new Date(startDateStr ? `${startDateStr}T12:00:00Z` : `${getTodayIsoDate()}T12:00:00Z`);
    if (isNaN(base.getTime())) return isVi ? `${daysCount} Ngày` : `${daysCount} ${daysCount === 1 ? 'Day' : 'Days'}`;
    const enMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const viMonths = ['Th01', 'Th02', 'Th03', 'Th04', 'Th05', 'Th06', 'Th07', 'Th08', 'Th09', 'Th10', 'Th11', 'Th12'];
    const months = isVi ? viMonths : enMonths;
    const startFmt = `${months[base.getUTCMonth()]} ${base.getUTCDate()}`;
    if (daysCount === 1) {
      return isVi ? `${startFmt} (1 Ngày)` : `${startFmt} (1 Day)`;
    }
    const end = new Date(base.getTime() + (daysCount - 1) * 86400000);
    const endFmt = `${months[end.getUTCMonth()]} ${end.getUTCDate()}`;
    return isVi ? `${startFmt} – ${endFmt} (${daysCount} Ngày)` : `${startFmt} – ${endFmt} (${daysCount} Days)`;
  } catch {
    return isVi ? `${daysCount} Ngày` : `${daysCount} ${daysCount === 1 ? 'Day' : 'Days'}`;
  }
}

export const DestinationPromptView: React.FC<DestinationPromptViewProps> = ({
  onGeneratePlan,
  isGenerating,
  selectedModel,
  onSelectModel,
  errorMessage = null,
  onClearError,
  onRetryLastAction,
  onOpenSavedTrips,
}) => {
  const { user, signIn, signOut } = useAuth();
  const { language, setLanguage, t, setIsLanguageModalOpen } = useLanguage();
  const isVi = language === 'vi';

  const themeOptions = [
    {
      id: 'gems-food',
      label: t.promptView.themes.gemsFood.label,
      desc: t.promptView.themes.gemsFood.desc,
      icon: UtensilsCrossed,
    },
    {
      id: 'culture-art',
      label: t.promptView.themes.cultureArt.label,
      desc: t.promptView.themes.cultureArt.desc,
      icon: Landmark,
    },
    {
      id: 'nature-scenic',
      label: t.promptView.themes.natureScenic.label,
      desc: t.promptView.themes.natureScenic.desc,
      icon: Trees,
    },
    {
      id: 'chill-coffee',
      label: t.promptView.themes.chillCoffee.label,
      desc: t.promptView.themes.chillCoffee.desc,
      icon: Coffee,
    },
  ];

  const loadingSteps = t.promptView.loadingSteps;

  const [destinationInput, setDestinationInput] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<{
    lat: number;
    lng: number;
    displayName: string;
  } | null>(null);
  const [suggestions, setSuggestions] = useState<GeocodedPlaceSuggestion[]>([]);
  const [isSearchingPlaces, setIsSearchingPlaces] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [useCurrentLocation, setUseCurrentLocation] = useState(false);
  const [isAcquiringLocation, setIsAcquiringLocation] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const [selectedThemeId, setSelectedThemeId] = useState<string>('gems-food');
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);

  // Time range state initialized with reasonable defaults
  const [startTime, setStartTime] = useState<string>('09:30');
  const [endTime, setEndTime] = useState<string>('18:00');

  // Multi-day trip state
  const [numDays, setNumDays] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(getTodayIsoDate());

  // Live client system clock for display (guaranteed 24-hour format)
  const [clientNow, setClientNow] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setClientNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const clientHours = String(clientNow.getHours()).padStart(2, '0');
  const clientMins = String(clientNow.getMinutes()).padStart(2, '0');
  const clientSecs = String(clientNow.getSeconds()).padStart(2, '0');
  const clientTimeString = `${clientHours}:${clientMins}:${clientSecs}`;

  // Time range calculation & validation
  const startMins = timeToMinutes(startTime);
  const endMins = timeToMinutes(endTime);
  const isTimeRangeValid = endMins > startMins;
  const totalDurationMins = isTimeRangeValid ? endMins - startMins : 0;
  const durationHours = Math.floor(totalDurationMins / 60);
  const durationRemainingMins = totalDurationMins % 60;

  // Active error combining incoming and local errors
  const activeError = localError || errorMessage;

  const hasDestinationText = destinationInput.trim().length > 0;
  const isFormValid = (useCurrentLocation || hasDestinationText) && isTimeRangeValid;

  // Debounced live geocoding via Photon OpenStreetMap API
  useEffect(() => {
    const query = destinationInput.trim();
    if (!query || query.length < 2) {
      setSuggestions([]);
      setIsSearchingPlaces(false);
      setIsDropdownOpen(false);
      setSearchError(null);
      return;
    }

    if (selectedPlace && selectedPlace.displayName.toLowerCase() === query.toLowerCase()) {
      return;
    }

    const controller = new AbortController();
    setIsSearchingPlaces(true);
    setSearchError(null);

    const timer = setTimeout(async () => {
      try {
        const results = await searchPhotonPlaces(query, controller.signal);
        setSuggestions(results);
        setIsDropdownOpen(true);
        setFocusedIndex(-1);
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Photon geocoding error:', err);
          setSearchError(t.promptView.searchError);
          setIsDropdownOpen(true);
        }
      } finally {
        setIsSearchingPlaces(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destinationInput, selectedPlace, t.promptView.searchError]);

  // Click outside to close suggestion dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Rotate loading step messages for reassuring feedback during generation
  useEffect(() => {
    if (!isGenerating && !isAcquiringLocation) {
      setLoadingStepIndex(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStepIndex((prev) => (prev + 1) % loadingSteps.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [isGenerating, isAcquiringLocation, loadingSteps.length]);

  const handleSelectSuggestion = (suggestion: GeocodedPlaceSuggestion) => {
    setDestinationInput(suggestion.displayName);
    setSelectedPlace({
      lat: suggestion.lat,
      lng: suggestion.lng,
      displayName: suggestion.displayName,
    });
    setIsDropdownOpen(false);
    setSuggestions([]);
    if (localError) setLocalError(null);
    if (errorMessage && onClearError) onClearError();
  };

  const handleQuickSelect = (preset: (typeof PRESET_DESTINATIONS)[0]) => {
    if (isGenerating || isAcquiringLocation) return;
    setDestinationInput(preset.name);
    setSelectedPlace({
      lat: preset.lat,
      lng: preset.lng,
      displayName: preset.name,
    });
    setIsDropdownOpen(false);
    setSuggestions([]);
    if (localError) setLocalError(null);
    if (onClearError) onClearError();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || suggestions.length === 0) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter') {
      if (focusedIndex >= 0 && focusedIndex < suggestions.length) {
        e.preventDefault();
        handleSelectSuggestion(suggestions[focusedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const currentTheme = themeOptions.find((th) => th.id === selectedThemeId) || themeOptions[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating || isAcquiringLocation || !isTimeRangeValid) return;
    if (localError) setLocalError(null);
    if (onClearError) onClearError();

    const rawDestination = destinationInput.trim();

    if (!useCurrentLocation && !rawDestination) {
      setLocalError(isVi ? 'Vui lòng nhập điểm đến hoặc tích chọn "Dùng vị trí GPS hiện tại".' : 'Please enter a destination or check "Use my current location".');
      return;
    }

    if (useCurrentLocation) {
      if (typeof window === 'undefined' || !navigator.geolocation) {
        setLocalError(isVi ? 'Trình duyệt của bạn không hỗ trợ định vị GPS. Vui lòng nhập điểm đến thủ công.' : 'Geolocation is not supported by your browser. Please enter a destination manually.');
        return;
      }

      setIsAcquiringLocation(true);

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000,
          });
        });

        const { latitude, longitude } = position.coords;

        let locationDescriptor = `Current Location (${latitude.toFixed(2)}, ${longitude.toFixed(2)})`;
        try {
          const geoRes = await fetch(`/api/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          if (geoRes.ok) {
            const geoData = await geoRes.json();
            if (geoData && geoData.city) {
              locationDescriptor = `${geoData.city}${geoData.country ? `, ${geoData.country}` : ''}`;
            }
          }
        } catch (geoErr) {
          console.warn('Reverse geocode note:', geoErr);
        }

        let payloadDestination = '';
        if (rawDestination) {
          payloadDestination = `near ${locationDescriptor}, heading to ${rawDestination}`;
        } else {
          payloadDestination = locationDescriptor;
        }

        setIsAcquiringLocation(false);

        await onGeneratePlan(
          payloadDestination,
          currentTheme.label,
          startTime,
          endTime,
          numDays,
          startDate,
          latitude,
          longitude
        );
      } catch (geoErr: any) {
        setIsAcquiringLocation(false);
        console.warn('Geolocation acquisition error:', geoErr);
        let errMsg = isVi ? 'Quyền truy cập vị trí bị từ chối hoặc không khả dụng.' : 'Location permission denied or unavailable. Please allow location access or type a destination.';
        if (geoErr && typeof geoErr === 'object') {
          if (geoErr.code === 1) {
            errMsg = isVi ? 'Quyền truy cập vị trí đã bị từ chối. Vui lòng bật vị trí trong trình duyệt hoặc nhập điểm đến.' : 'Location permission was denied. Please allow location access in your browser or enter a destination.';
          } else if (geoErr.code === 2) {
            errMsg = isVi ? 'Vị trí hiện tại của bạn không khả dụng. Vui lòng nhập điểm đến thủ công.' : 'Your current location is currently unavailable. Please enter a destination manually.';
          } else if (geoErr.code === 3) {
            errMsg = isVi ? 'Yêu cầu định vị đã hết thời gian chờ. Vui lòng thử lại hoặc nhập điểm đến.' : 'Location request timed out. Please check your GPS signal or enter a destination manually.';
          }
        }
        setLocalError(errMsg);
      }
    } else {
      let finalLat = selectedPlace?.lat ?? null;
      let finalLng = selectedPlace?.lng ?? null;

      if (finalLat === null || finalLng === null) {
        const matchingPreset = PRESET_DESTINATIONS.find(
          (p) => p.name.toLowerCase() === rawDestination.toLowerCase()
        );
        if (matchingPreset) {
          finalLat = matchingPreset.lat;
          finalLng = matchingPreset.lng;
        } else if (suggestions.length > 0) {
          finalLat = suggestions[0].lat;
          finalLng = suggestions[0].lng;
        }
      }

      await onGeneratePlan(
        rawDestination,
        currentTheme.label,
        startTime,
        endTime,
        numDays,
        startDate,
        finalLat,
        finalLng
      );
    }
  };

  const setTimePreset = (start: string, end: string) => {
    if (isGenerating || isAcquiringLocation) return;
    setStartTime(start);
    setEndTime(end);
    if (localError) setLocalError(null);
    if (onClearError) onClearError();
  };

  const snapStartToCurrentTime = () => {
    const now = new Date();
    const currentMins = now.getMinutes();
    const rounded = Math.ceil(currentMins / 15) * 15;
    now.setMinutes(rounded);
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const newStart = `${h}:${m}`;
    setStartTime(newStart);

    const sMins = timeToMinutes(newStart);
    if (endMins <= sMins) {
      const newEndMins = Math.min(sMins + 7 * 60, 23 * 60 + 45);
      const eh = String(Math.floor(newEndMins / 60)).padStart(2, '0');
      const em = String(newEndMins % 60).padStart(2, '0');
      setEndTime(`${eh}:${em}`);
    }
  };

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f9fc] text-[#191c20] flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative font-sans overflow-x-hidden w-full max-w-full">
      {/* Background M3 ambient gradient accents - Constrained to prevent horizontal scroll */}
      <div className="absolute top-0 right-0 sm:right-1/4 w-72 sm:w-96 h-72 sm:h-96 max-w-full bg-[#d3e3fd]/40 rounded-full blur-3xl pointer-events-none overflow-hidden" />
      <div className="absolute bottom-10 left-0 sm:left-1/4 w-72 sm:w-96 h-72 sm:h-96 max-w-full bg-[#e8def8]/40 rounded-full blur-3xl pointer-events-none overflow-hidden" />

      {/* Top Brand Bar (M3 App Bar) - Elevated z-index to stay above main content */}
      <header className="relative z-40 flex items-center justify-between pb-4 border-b border-[#e6ebf2] max-w-5xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-2xl bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center shadow-xs">
            <Compass className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-bold tracking-tight text-[#191c20] flex items-center gap-1.5">
              <span>{t.header.brandTitle}</span>
            </div>
            <p className="text-xs text-[#44474e]">{t.promptView.badge}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Live Client System Clock Badge */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#ecf0f6] text-[#191c20] border border-[#c4c7cf]/60 font-mono text-xs shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold">{clientTimeString}</span>
          </div>

          {/* Saved Trips Quick Button */}
          {onOpenSavedTrips && (
            <button
              type="button"
              onClick={onOpenSavedTrips}
              title={t.common.mySavedPlans}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#f0f4f9] hover:bg-[#d3e3fd] text-[#0b57d0] text-xs font-semibold border border-[#e6ebf2] shadow-2xs transition-all active:scale-95 cursor-pointer"
            >
              <FolderHeart className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t.common.mySavedPlans}</span>
            </button>
          )}

          {/* Google Auth Status & Profile / AI Settings Menu */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((prev) => !prev)}
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden flex items-center justify-center bg-[#f0f4f9] hover:bg-[#e6ebf2] border border-[#c4c7cf]/80 transition-all cursor-pointer shadow-2xs shrink-0"
              title={user ? `${user.displayName || user.email}` : t.header.accountTooltip}
            >
              {user ? (
                user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || 'User'}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-[#0b57d0] text-white flex items-center justify-center font-bold text-xs">
                    {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                  </div>
                )
              ) : (
                <UserIcon className="w-4 h-4 text-[#44474e]" />
              )}
            </button>

            {/* Dropdown Menu (Account + Language + AI Model Selector) */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white border border-[#e6ebf2] shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-2.5 border-b border-[#e6ebf2]">
                  {user ? (
                    <div>
                      <p className="font-bold text-[#191c20] truncate">{user.displayName || 'Google User'}</p>
                      <p className="text-[11px] text-[#74777f] truncate">{user.email}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-[#191c20]">{t.common.guestMode}</p>
                        <p className="text-[11px] text-[#74777f]">{t.header.signInToSync}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsUserMenuOpen(false);
                          try {
                            await signIn();
                          } catch (e) {
                            console.error('Sign-in failed:', e);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        {t.common.signIn}
                      </button>
                    </div>
                  )}
                </div>

                {/* Saved Trip Plans Quick Link (Moved above Language) */}
                {onOpenSavedTrips && (
                  <div className="py-1 border-b border-[#e6ebf2]">
                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onOpenSavedTrips();
                      }}
                      className="w-full px-4 py-2.5 flex items-center gap-2.5 text-left hover:bg-[#f0f4f9] text-[#191c20] font-semibold transition-colors cursor-pointer"
                    >
                      <FolderHeart className="w-4 h-4 text-[#0b57d0]" />
                      <span>{t.common.mySavedPlans}</span>
                    </button>
                  </div>
                )}

                {/* Language Switcher Section */}
                <div className="p-3 border-b border-[#e6ebf2] bg-white">
                  <div className="flex items-center gap-1.5 text-[#44474e] font-bold text-[10px] uppercase tracking-wider mb-2">
                    <Globe className="w-3.5 h-3.5 text-[#0b57d0]" />
                    <span>{t.header.languageSection}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setLanguage('en')}
                      className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                        language === 'en'
                          ? 'bg-[#d3e3fd] border-[#0b57d0] text-[#041e49]'
                          : 'bg-white border-[#e6ebf2] text-[#44474e] hover:bg-[#f0f4f9]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>🇺🇸</span>
                        <span>English</span>
                      </span>
                      {language === 'en' && <Check className="w-3 h-3 text-[#0b57d0] stroke-[3]" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setLanguage('vi')}
                      className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between text-xs font-bold transition-all cursor-pointer ${
                        language === 'vi'
                          ? 'bg-[#d3e3fd] border-[#0b57d0] text-[#041e49]'
                          : 'bg-white border-[#e6ebf2] text-[#44474e] hover:bg-[#f0f4f9]'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>🇻🇳</span>
                        <span>Tiếng Việt</span>
                      </span>
                      {language === 'vi' && <Check className="w-3 h-3 text-[#0b57d0] stroke-[3]" />}
                    </button>
                  </div>
                </div>

                {/* AI Intelligence Model Selector in Account Popup */}
                <div className="p-3.5 border-b border-[#e6ebf2] bg-white">
                  <div className="flex items-center gap-1.5 text-[#44474e] font-bold text-[10px] uppercase tracking-wider mb-2">
                    <Bot className="w-3.5 h-3.5 text-[#0b57d0]" />
                    <span>{t.header.aiModelLabel}</span>
                  </div>
                  <ModelSelector
                    selectedModel={selectedModel}
                    onSelectModel={onSelectModel}
                    variant="light"
                    hideLabel={true}
                  />
                </div>

                {user && (
                  <div className="pt-1 border-t border-[#e6ebf2]">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsUserMenuOpen(false);
                        await signOut();
                      }}
                      className="w-full px-4 py-2.5 flex items-center gap-2.5 text-left hover:bg-[#ffdad6]/60 text-[#ba1a1a] font-semibold transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-[#ba1a1a]" />
                      <span>{t.common.signOut}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area: Responsive Multi-Column on Desktop (≥1024px) */}
      <main className="relative z-10 my-auto py-6 sm:py-8 max-w-5xl mx-auto w-full">
        {/* Header Title Section */}
        <div className="mb-6 space-y-2 text-left">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-[#191c20] leading-tight">
            {t.promptView.heroTitle}
          </h1>
          <p className="text-sm sm:text-base text-[#44474e] max-w-2xl leading-relaxed">
            {t.promptView.heroSubtitle}
          </p>
        </div>

        {/* Error Banner with 1-Tap Retry Action */}
        {activeError && (
          <div className="mb-6 p-4 rounded-2xl bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#410002] text-xs sm:text-sm flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-[#ba1a1a] shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-[#410002]">{isVi ? 'Không thể tạo lịch trình' : 'Unable to plan itinerary'}</div>
                <p className="text-xs text-[#410002]/90 mt-0.5 leading-relaxed">{activeError}</p>
              </div>
            </div>
            {onRetryLastAction && (
              <button
                type="button"
                onClick={onRetryLastAction}
                className="px-3 py-1.5 bg-[#ba1a1a] hover:bg-[#93000a] text-white rounded-full font-semibold text-xs shrink-0 flex items-center gap-1 transition-all active:scale-95 shadow-xs cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t.common.retry}</span>
              </button>
            )}
          </div>
        )}

        {/* Form Container: 2-Column Grid on Desktop, Single Column on Mobile */}
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
          {/* LEFT COLUMN: Destination & Quick Suggestions & Location */}
          <div className="lg:col-span-6 space-y-4 sm:space-y-5">
            {/* Destination Search & Suggestions (M3 Elevated Card) */}
            <div className="p-4 sm:p-5 bg-white border border-[#e6ebf2] rounded-[24px] shadow-xs space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="destination-input-field"
                  className="block text-xs font-bold uppercase tracking-wider text-[#44474e]"
                >
                  {isVi ? 'Điểm đến (Thành phố hoặc Khu vực)' : 'Destination (City or Region)'}
                </label>
                {selectedPlace && !useCurrentLocation && (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>{isVi ? 'Đã liên kết tọa độ' : 'Location Resolved'}</span>
                  </span>
                )}
              </div>

              {/* M3 Outlined Text Field with Photon Autocomplete */}
              <div ref={containerRef} className="relative">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#44474e]">
                    {isSearchingPlaces ? (
                      <Loader2 className="w-4 h-4 text-[#0b57d0] animate-spin" />
                    ) : (
                      <MapPin
                        className={`w-4 h-4 ${
                          selectedPlace && !useCurrentLocation ? 'text-emerald-600' : 'text-[#0b57d0]'
                        }`}
                      />
                    )}
                  </div>
                  <input
                    ref={inputRef}
                    id="destination-input-field"
                    type="text"
                    value={destinationInput}
                    onChange={(e) => {
                      setDestinationInput(e.target.value);
                      if (selectedPlace && selectedPlace.displayName !== e.target.value) {
                        setSelectedPlace(null);
                      }
                      if (localError) setLocalError(null);
                      if (errorMessage && onClearError) onClearError();
                    }}
                    onFocus={() => {
                      if (suggestions.length > 0 || (destinationInput.trim().length >= 2 && !selectedPlace)) {
                        setIsDropdownOpen(true);
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      useCurrentLocation
                        ? (isVi ? 'Tùy chọn: sở thích hoặc khu vực, vd: Phố Cổ, cà phê ven hồ...' : 'Optional: area or interest, e.g. Historic Quarter, cafes...')
                        : t.promptView.inputPlaceholder
                    }
                    disabled={isGenerating || isAcquiringLocation}
                    autoComplete="off"
                    className="w-full pl-10 pr-10 py-3 bg-[#f8f9fc] hover:bg-white focus:bg-white disabled:opacity-60 border border-[#c4c7cf] focus:border-[#0b57d0] focus:ring-2 focus:ring-[#0b57d0]/20 rounded-xl text-sm font-semibold text-[#191c20] placeholder:text-[#74777f] outline-none transition-all"
                    autoFocus
                  />
                  {destinationInput && !isGenerating && !isAcquiringLocation && (
                    <button
                      type="button"
                      onClick={() => {
                        setDestinationInput('');
                        setSelectedPlace(null);
                        setSuggestions([]);
                        setIsDropdownOpen(false);
                        inputRef.current?.focus();
                      }}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#74777f] hover:text-[#191c20] cursor-pointer"
                      title="Clear destination"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown Panel (Photon Live Results) */}
                {isDropdownOpen && !useCurrentLocation && (
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-[#c4c7cf] rounded-2xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Live search status indicator */}
                    {isSearchingPlaces && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#f8f9fc] border-b border-[#e6ebf2] text-xs font-semibold text-[#0b57d0]">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>{isVi ? 'Đang tìm địa điểm trên OpenStreetMap...' : 'Searching places on OpenStreetMap...'}</span>
                      </div>
                    )}

                    {/* Geocoding Error Fallback Notice */}
                    {searchError && (
                      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#fff8f6] border-b border-[#ffdad6] text-xs text-[#ba1a1a]">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{searchError}</span>
                      </div>
                    )}

                    {/* Matching Place Suggestions */}
                    {suggestions.length > 0 && (
                      <div className="max-h-64 overflow-y-auto divide-y divide-[#f0f4f9]">
                        {suggestions.map((suggestion, index) => {
                          const isFocused = index === focusedIndex;
                          return (
                            <button
                              key={suggestion.id}
                              type="button"
                              onClick={() => handleSelectSuggestion(suggestion)}
                              onMouseEnter={() => setFocusedIndex(index)}
                              className={`w-full px-4 py-3 text-left flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                                isFocused ? 'bg-[#d3e3fd]/40' : 'hover:bg-[#f8f9fc]'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-[#ecf0f6] text-[#0b57d0] flex items-center justify-center shrink-0">
                                  <MapPin className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs sm:text-sm font-bold text-[#191c20] truncate">
                                    {suggestion.primaryName}
                                  </div>
                                  {suggestion.secondaryLabel && (
                                    <div className="text-[11px] text-[#44474e] truncate">
                                      {suggestion.secondaryLabel}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {suggestion.placeType && (
                                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-[#f0f4f9] text-[#44474e] border border-[#c4c7cf]/40">
                                    {suggestion.placeType}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Empty Result State */}
                    {!isSearchingPlaces && suggestions.length === 0 && !searchError && destinationInput.trim().length >= 2 && (
                      <div className="px-4 py-4 text-center text-xs text-[#74777f] bg-[#f8f9fc] space-y-1">
                        <div className="font-semibold text-[#191c20]">
                          {isVi ? `Không tìm thấy địa điểm khớp với "${destinationInput}"` : `No locations found matching "${destinationInput}"`}
                        </div>
                        <p className="text-[11px] text-[#44474e]">
                          {isVi ? 'Bạn vẫn có thể tiếp tục tạo lịch trình với tên địa điểm tùy chỉnh này.' : 'You can still proceed and generate your plan with this custom destination name.'}
                        </p>
                      </div>
                    )}

                    {/* Attribution & Geocode Status Footer */}
                    <div className="px-4 py-1.5 bg-[#f8f9fc] border-t border-[#e6ebf2] flex items-center justify-between text-[10px] text-[#74777f]">
                      <span>OpenStreetMap Geocoding</span>
                      {selectedPlace && (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1">
                          <Check className="w-3 h-3" /> {isVi ? 'Đã xác thực tọa độ GPS thực' : 'Real GPS Coordinates Linked'}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Inspiration (M3 Suggestion Chips Grid) with Real Coordinates */}
              <div className="space-y-2 pt-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#74777f] block">
                  {t.promptView.popularDestinations}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {PRESET_DESTINATIONS.map((preset) => {
                    const isSelected = destinationInput === preset.name;
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        disabled={isGenerating || isAcquiringLocation}
                        onClick={() => handleQuickSelect(preset)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-center transition-all truncate cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                          isSelected
                            ? 'bg-[#d3e3fd] border-[#0b57d0] text-[#041e49] font-bold shadow-xs'
                            : 'bg-[#f8f9fc] border-[#c4c7cf]/70 text-[#191c20] hover:bg-[#ecf0f6] hover:border-[#74777f]'
                        }`}
                        title={preset.name}
                      >
                        {preset.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Location Option (M3 Outlined Card) */}
            <label
              htmlFor="use-current-location-checkbox"
              className={`p-4 bg-white hover:bg-[#f8f9fc] border rounded-[20px] flex items-center justify-between gap-3 cursor-pointer transition-all shadow-xs ${
                useCurrentLocation
                  ? 'border-[#0b57d0] bg-[#d3e3fd]/20 ring-1 ring-[#0b57d0]'
                  : 'border-[#e6ebf2]'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex items-center justify-center">
                  <input
                    id="use-current-location-checkbox"
                    type="checkbox"
                    checked={useCurrentLocation}
                    onChange={(e) => {
                      setUseCurrentLocation(e.target.checked);
                      if (localError) setLocalError(null);
                      if (errorMessage && onClearError) onClearError();
                    }}
                    disabled={isGenerating || isAcquiringLocation}
                    className="w-4 h-4 rounded text-[#0b57d0] bg-white border-[#74777f] focus:ring-[#0b57d0] cursor-pointer"
                  />
                </div>
                <div className="text-left">
                  <div className="text-xs sm:text-sm font-bold text-[#191c20] flex items-center gap-1.5">
                    <Navigation
                      className={`w-3.5 h-3.5 ${
                        useCurrentLocation ? 'text-[#0b57d0]' : 'text-[#74777f]'
                      }`}
                    />
                    <span>{t.promptView.useMyLocation}</span>
                  </div>
                  <p className="text-xs text-[#44474e] mt-0.5 leading-relaxed">
                    {useCurrentLocation && hasDestinationText
                      ? (isVi ? 'Bắt đầu gần vị trí hiện tại & hướng tới điểm đến đã nhập' : 'Will anchor plan near current location & head towards destination')
                      : useCurrentLocation
                      ? (isVi ? 'Tự động sử dụng tọa độ hiện tại cho lịch trình khám phá xung quanh' : 'Will automatically use current coordinates for a local plan')
                      : (isVi ? 'Tích chọn để bắt đầu hành trình ngay từ nơi bạn đang đứng' : 'Check to start itinerary directly from where you are right now')}
                  </p>
                </div>
              </div>

              {useCurrentLocation && (
                <span className="text-xs font-bold text-[#041e49] bg-[#d3e3fd] px-2.5 py-1 rounded-full shrink-0">
                  {isVi ? 'Đang bật' : 'Active'}
                </span>
              )}
            </label>
          </div>

          {/* RIGHT COLUMN: Duration, Time Window, Style/Theme & Submit */}
          <div className="lg:col-span-6 space-y-4 sm:space-y-5">
            {/* Multi-Day Trip Duration & Start Date (M3 Elevated Card) */}
            <div className="p-4 sm:p-5 bg-white border border-[#e6ebf2] rounded-[24px] shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#191c20]">
                  <Calendar className="w-4 h-4 text-[#0b57d0]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#44474e]">
                    {t.promptView.durationTitle}
                  </span>
                </div>

                {/* Formatted Date Range Badge */}
                <span className="text-xs font-semibold text-[#041e49] bg-[#d3e3fd] px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
                  {formatDateRange(startDate, numDays, isVi)}
                </span>
              </div>

              {/* Multi-Day Day Count Selection & Stepper */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Day Count Stepper */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#74777f]">
                    {isVi ? 'Số ngày hành trình' : 'Number of Days'}
                  </label>
                  <div className="flex items-center bg-[#f8f9fc] border border-[#c4c7cf] rounded-xl p-1 justify-between">
                    <button
                      type="button"
                      disabled={numDays <= 1 || isGenerating || isAcquiringLocation}
                      onClick={() => setNumDays((prev) => Math.max(1, prev - 1))}
                      className="w-8 h-8 rounded-lg bg-white hover:bg-[#ecf0f6] border border-[#c4c7cf]/60 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-[#191c20] transition-colors cursor-pointer"
                      title="Decrease days"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>

                    <div className="text-xs font-bold text-[#191c20] flex items-center gap-1">
                      <span>{numDays}</span>
                      <span className="text-xs font-medium text-[#44474e]">
                        {isVi ? 'Ngày' : (numDays === 1 ? 'Day' : 'Days')}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={numDays >= 7 || isGenerating || isAcquiringLocation}
                      onClick={() => setNumDays((prev) => Math.min(7, prev + 1))}
                      className="w-8 h-8 rounded-lg bg-white hover:bg-[#ecf0f6] border border-[#c4c7cf]/60 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-[#191c20] transition-colors cursor-pointer"
                      title="Increase days"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Start Date Picker */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#74777f]">
                    {t.promptView.startDate}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      disabled={isGenerating || isAcquiringLocation}
                      className="w-full px-3 py-2 pr-9 bg-[#f8f9fc] hover:bg-white focus:bg-white border border-[#c4c7cf] focus:border-[#0b57d0] focus:ring-2 focus:ring-[#0b57d0]/20 rounded-xl text-xs font-bold text-[#191c20] outline-none transition-all cursor-pointer"
                    />
                    <Calendar className="w-4 h-4 text-[#0b57d0] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>

            {/* Planned Time Window Card (M3 Elevated Card) */}
            <div className="p-4 sm:p-5 bg-white border border-[#e6ebf2] rounded-[24px] shadow-xs space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-[#191c20]">
                  <Clock className="w-4 h-4 text-[#0b57d0]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[#44474e]">
                    {isVi ? 'Khung giờ hàng ngày' : 'Planned Time Window'}
                  </span>
                </div>

                {/* Snap to Now button */}
                <button
                  type="button"
                  onClick={snapStartToCurrentTime}
                  disabled={isGenerating || isAcquiringLocation}
                  className="text-xs font-semibold text-[#0b57d0] hover:bg-[#d3e3fd]/50 px-2.5 py-1 rounded-full transition-colors cursor-pointer"
                  title="Snap start time to current live clock"
                >
                  {isVi ? 'Cập nhật giờ hiện tại' : 'Snap Start to Now'}
                </button>
              </div>

              {/* Start & End Time Input Grid */}
              <div className="grid grid-cols-2 gap-3">
                {/* Start Time */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#74777f]">
                    {t.promptView.dailyStartTime}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => {
                        setStartTime(e.target.value);
                        if (localError) setLocalError(null);
                        if (errorMessage && onClearError) onClearError();
                      }}
                      disabled={isGenerating || isAcquiringLocation}
                      className="w-full px-3 py-2 pr-9 bg-[#f8f9fc] hover:bg-white focus:bg-white border border-[#c4c7cf] focus:border-[#0b57d0] focus:ring-2 focus:ring-[#0b57d0]/20 rounded-xl text-xs font-bold text-[#191c20] outline-none transition-all cursor-pointer"
                    />
                    <Clock className="w-4 h-4 text-[#0b57d0] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* End Time */}
                <div className="space-y-1">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#74777f]">
                    {t.promptView.dailyEndTime}
                  </label>
                  <div className="relative flex items-center">
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => {
                        setEndTime(e.target.value);
                        if (localError) setLocalError(null);
                        if (errorMessage && onClearError) onClearError();
                      }}
                      disabled={isGenerating || isAcquiringLocation}
                      className={`w-full px-3 py-2 pr-9 bg-[#f8f9fc] hover:bg-white focus:bg-white border rounded-xl text-xs font-bold text-[#191c20] outline-none transition-all cursor-pointer ${
                        isTimeRangeValid
                          ? 'border-[#c4c7cf] focus:border-[#0b57d0] focus:ring-2 focus:ring-[#0b57d0]/20'
                          : 'border-[#ba1a1a] bg-[#ffdad6]/20 text-[#ba1a1a] focus:border-[#ba1a1a]'
                      }`}
                    />
                    <Clock className="w-4 h-4 text-[#0b57d0] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Validation & Duration Status */}
              <div className="flex items-center justify-between text-xs pt-1">
                {isTimeRangeValid ? (
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#00639b]">
                    <Sparkles className="w-3.5 h-3.5 text-[#00639b]" />
                    <span>
                      {t.common.duration}: {durationHours > 0 ? `${durationHours}h ` : ''}
                      {durationRemainingMins > 0 ? `${durationRemainingMins}m` : ''} ({totalDurationMins} {t.common.mins})
                    </span>
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1 text-xs font-bold text-[#ba1a1a]">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{isVi ? 'Giờ kết thúc phải sau giờ bắt đầu' : 'End time must be after start time'}</span>
                  </div>
                )}
              </div>

              {/* Quick Time Window Presets (M3 Filter Chips) */}
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#e6ebf2]">
                {[
                  { label: isVi ? 'Cả ngày (09:00 - 18:00)' : 'Full Day (09:00 - 18:00)', s: '09:00', e: '18:00' },
                  { label: isVi ? 'Buổi sáng (08:30 - 13:00)' : 'Morning (08:30 - 13:00)', s: '08:30', e: '13:00' },
                  { label: isVi ? 'Buổi chiều (13:00 - 18:30)' : 'Afternoon (13:00 - 18:30)', s: '13:00', e: '18:30' },
                  { label: isVi ? 'Buổi tối (18:00 - 23:30)' : 'Evening (18:00 - 23:30)', s: '18:00', e: '23:30' },
                ].map((preset) => {
                  const isPresetActive = startTime === preset.s && endTime === preset.e;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setTimePreset(preset.s, preset.e)}
                      disabled={isGenerating || isAcquiringLocation}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        isPresetActive
                          ? 'bg-[#d3e3fd] border-[#0b57d0] text-[#041e49] font-semibold shadow-xs'
                          : 'bg-[#f8f9fc] border-[#c4c7cf]/70 text-[#44474e] hover:bg-[#ecf0f6]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Trip Focus / Style (M3 Cards in 2x2 Grid) */}
            <div className="p-4 sm:p-5 bg-white border border-[#e6ebf2] rounded-[24px] shadow-xs space-y-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-[#44474e]">
                {t.promptView.tripThemeTitle}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {themeOptions.map((theme) => {
                  const isSelected = selectedThemeId === theme.id;
                  const IconComponent = theme.icon;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      disabled={isGenerating || isAcquiringLocation}
                      onClick={() => setSelectedThemeId(theme.id)}
                      className={`p-3 rounded-[16px] border text-left transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        isSelected
                          ? 'bg-[#d3e3fd]/40 border-[#0b57d0] text-[#041e49] shadow-xs ring-1 ring-[#0b57d0]'
                          : 'bg-[#f8f9fc] border-[#e6ebf2] text-[#44474e] hover:bg-[#ecf0f6] hover:text-[#191c20]'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <IconComponent
                          className={`w-4 h-4 ${
                            isSelected ? 'text-[#0b57d0]' : 'text-[#74777f]'
                          }`}
                        />
                        <span className="text-xs font-bold">{theme.label}</span>
                      </div>
                      <p className="text-[11px] text-[#44474e] line-clamp-1">{theme.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Action Button: M3 Filled Button with shadow */}
            <button
              type="submit"
              disabled={!isFormValid || isGenerating || isAcquiringLocation}
              className="w-full py-4 bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold rounded-full text-sm sm:text-base shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
            >
              {isGenerating || isAcquiringLocation ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-white" />
                  <span>
                    {isAcquiringLocation
                      ? t.promptView.locating
                      : (isVi ? `Đang tạo lịch trình ${numDays > 1 ? `${numDays} ngày ` : ''}với dữ liệu thời tiết thực...` : `Crafting ${numDays > 1 ? `${numDays}-Day ` : ''}Itinerary with Live Weather...`)}
                  </span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-white" />
                  <span>
                    {isVi ? `Tạo lịch trình ${numDays > 1 ? `${numDays} ngày ` : ''}thông minh` : `Generate Adaptive ${numDays > 1 ? `${numDays}-Day ` : ''}Trip Plan`}
                  </span>
                  <ArrowRight className="w-5 h-5 ml-1 stroke-[2.5]" />
                </>
              )}
            </button>
          </div>
        </form>
      </main>

      {/* Footer Feature Callouts (M3 Tonal Chips) */}
      <footer className="relative z-10 pt-6 border-t border-[#e6ebf2] max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
          <div className="flex items-center justify-center gap-2 p-2.5 rounded-full bg-white border border-[#e6ebf2] text-xs font-semibold text-[#191c20] shadow-xs">
            <Zap className="w-4 h-4 text-[#0b57d0]" />
            <span>{isVi ? 'Tự thích ứng theo thời tiết' : 'Real-time Weather Pivots'}</span>
          </div>
          <div className="flex items-center justify-center gap-2 p-2.5 rounded-full bg-white border border-[#e6ebf2] text-xs font-semibold text-[#191c20] shadow-xs">
            <Sparkles className="w-4 h-4 text-[#6750a4]" />
            <span>{isVi ? 'Phân tích hàng đợi qua hình ảnh' : 'Multimodal Vision Crowds'}</span>
          </div>
          <div className="flex items-center justify-center gap-2 p-2.5 rounded-full bg-white border border-[#e6ebf2] text-xs font-semibold text-[#191c20] shadow-xs">
            <ShieldCheck className="w-4 h-4 text-[#00639b]" />
            <span>{isVi ? 'Thích ứng theo giọng nói & thể trạng' : 'Voice & Mood Adaptation'}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};




