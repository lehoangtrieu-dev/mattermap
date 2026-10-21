import React, { useState } from 'react';
import { MapPin, Navigation, Sparkles, X, RefreshCw, ArrowRight, AlertCircle, RotateCcw } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface CityPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCityName: string;
  isGpsActive: boolean;
  initialStartTime?: string;
  initialEndTime?: string;
  onUseCurrentGps: () => void;
  onGenerateCustomCity: (cityName: string, theme: string, startTime?: string, endTime?: string) => Promise<void>;
}

const QUICK_OPTIONS = [
  'Kyoto, Japan',
  'Rome, Italy',
  'Reykjavik, Iceland',
  'Barcelona, Spain',
  'San Francisco, USA',
  'Hanoi, Vietnam',
  'Vancouver, Canada',
  'Oaxaca, Mexico',
];

export const CityPickerModal: React.FC<CityPickerModalProps> = ({
  isOpen,
  onClose,
  currentCityName,
  isGpsActive,
  initialStartTime = '09:30',
  initialEndTime = '18:00',
  onUseCurrentGps,
  onGenerateCustomCity,
}) => {
  const [customCity, setCustomCity] = useState('');
  const [customTheme, setCustomTheme] = useState('Local Hidden Gems & Great Food');
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useBodyScrollLock(isOpen);

  if (!isOpen) return null;

  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customCity.trim();
    if (!trimmed || isGenerating) return;

    setIsGenerating(true);
    setErrorMessage(null);
    try {
      await onGenerateCustomCity(trimmed, customTheme, startTime, endTime);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || "Couldn't generate itinerary for this city. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQuickPick = async (city: string) => {
    if (isGenerating) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      await onGenerateCustomCity(city, customTheme, startTime, endTime);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || `Couldn't generate itinerary for ${city}. Please retry.`);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] border border-[#e6ebf2] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
        {/* Header - M3 Surface Container */}
        <div className="bg-[#f0f4f9] text-[#191c20] px-6 py-4 flex items-center justify-between border-b border-[#e6ebf2]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#ffdcc2] text-[#6e3900] flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-[#44474e]">
                Change Destination
              </div>
              <h3 className="text-base font-bold tracking-tight text-[#191c20]">
                {currentCityName || 'Explore Any City'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="w-8 h-8 rounded-full bg-white hover:bg-[#ecf0f6] text-[#44474e] hover:text-[#191c20] disabled:opacity-50 flex items-center justify-center transition-colors border border-[#e6ebf2]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-[20px] bg-[#ba1a1a]/10 border border-[#ba1a1a]/30 text-[#ba1a1a] text-xs flex items-start justify-between gap-2 animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#ba1a1a] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Generation Notice</div>
                  <p className="text-[11px] text-[#ba1a1a]/90 mt-0.5 leading-snug">{errorMessage}</p>
                </div>
              </div>
              {customCity.trim() && (
                <button
                  onClick={() => handleCustomSubmit({ preventDefault: () => {} } as any)}
                  className="px-3 py-1 bg-[#ba1a1a] text-white text-[11px] font-bold rounded-lg shrink-0 flex items-center gap-1 shadow-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Retry</span>
                </button>
              )}
            </div>
          )}

          {/* GPS Live Geolocation Button (M3 Filled / Outlined Card) */}
          <button
            onClick={() => {
              if (isGenerating) return;
              onUseCurrentGps();
              onClose();
            }}
            disabled={isGenerating}
            className={`w-full p-4 rounded-[20px] border text-left transition-all active:scale-98 flex items-center justify-between disabled:opacity-50 disabled:cursor-not-allowed ${
              isGpsActive
                ? 'bg-[#d3e3fd]/30 border-[#0b57d0] text-[#041e49] shadow-xs'
                : 'bg-[#f8f9fc] hover:bg-white border-[#e6ebf2] text-[#191c20]'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#0b57d0] text-white flex items-center justify-center shadow-xs">
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <div className="font-bold text-sm text-[#191c20] flex items-center gap-2">
                  <span>Use My Current Live GPS</span>
                  {isGpsActive && (
                    <span className="text-[10px] font-bold text-[#041e49] bg-[#d3e3fd] px-2.5 py-0.5 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#44474e] mt-0.5">
                  Fetches your exact live coordinates and local weather
                </p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-[#0b57d0]" />
          </button>

          {/* Quick Destination Inspiration */}
          <div className="space-y-2">
            <span className="font-bold text-[#44474e] uppercase tracking-wider text-[10px] block">
              Quick Inspiration
            </span>
            <div className="grid grid-cols-2 gap-2.5">
              {QUICK_OPTIONS.map((city) => (
                <button
                  key={city}
                  type="button"
                  disabled={isGenerating}
                  onClick={() => handleQuickPick(city)}
                  className="p-3 rounded-[16px] border border-[#e6ebf2] hover:border-[#0b57d0] bg-[#f8f9fc] hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed text-[#191c20] font-semibold text-xs text-left transition-all active:scale-98"
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Destination Form */}
          <div className="pt-2 border-t border-[#e6ebf2] space-y-2.5">
            <span className="font-bold text-[#44474e] uppercase tracking-wider text-[10px] flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#0b57d0]" />
              Generate Custom Destination
            </span>

            <form onSubmit={handleCustomSubmit} className="space-y-2.5">
              <input
                type="text"
                value={customCity}
                onChange={(e) => {
                  setCustomCity(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter any city or region (e.g. Zurich, Bali, Da Nang...)"
                disabled={isGenerating}
                className="w-full p-3.5 rounded-[16px] border border-[#c4c7cf] text-xs font-semibold text-[#191c20] bg-[#f8f9fc] focus:bg-white focus:border-[#0b57d0] focus:ring-2 focus:ring-[#0b57d0]/20 outline-hidden disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={isGenerating || !customCity.trim()}
                className="w-full py-3.5 bg-[#0b57d0] hover:bg-[#0842a0] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-full text-xs shadow-md flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
                    <span>Gemini is Crafting Itinerary...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                    <span>Generate New Trip Plan</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
