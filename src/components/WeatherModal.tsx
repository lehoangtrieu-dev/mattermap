import React, { useState } from 'react';
import {
  X,
  Sun,
  CloudSun,
  CloudRain,
  CloudLightning,
  Snowflake,
  Flame,
  Check,
  Sparkles,
} from 'lucide-react';
import { LiveWeather } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface WeatherModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentWeather: LiveWeather | null;
  onApplyWeather: (newWeather: LiveWeather, shouldReplan: boolean) => void;
}

interface WeatherPreset {
  id: string;
  name: string;
  nameVi: string;
  condition: string;
  tempC: number;
  isRaining: boolean;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  descriptionVi: string;
  badgeColor: string;
  accentBg: string;
  textColor: string;
}

const PRESET_OPTIONS: WeatherPreset[] = [
  {
    id: 'sunny',
    name: 'Clear & Sunny',
    nameVi: 'Trời quang & Nắng',
    condition: 'Sunny',
    tempC: 24,
    isRaining: false,
    icon: Sun,
    description: 'Pleasant open skies, great for outdoor sights and walking paths.',
    descriptionVi: 'Bầu trời trong xanh dễ chịu, tuyệt vời cho các điểm tham quan ngoài trời.',
    badgeColor: 'bg-[#ffdcc2] text-[#6e3900]',
    accentBg: 'hover:bg-[#ffdcc2]/30 active:bg-[#ffdcc2]/50',
    textColor: 'text-[#6e3900]',
  },
  {
    id: 'partly_cloudy',
    name: 'Partly Cloudy',
    nameVi: 'Nhiều mây / Mát mẻ',
    condition: 'Partly Cloudy',
    tempC: 20,
    isRaining: false,
    icon: CloudSun,
    description: 'Comfortable mild temperature with light cloud coverage.',
    descriptionVi: 'Nhiệt độ ôn hòa dễ chịu với mây nhẹ che phủ.',
    badgeColor: 'bg-[#f0f4f9] text-[#191c20]',
    accentBg: 'hover:bg-[#f0f4f9] active:bg-[#e6ebf2]',
    textColor: 'text-[#191c20]',
  },
  {
    id: 'light_rain',
    name: 'Light Rain / Showers',
    nameVi: 'Mưa nhỏ / Mưa rào',
    condition: 'Light Rain',
    tempC: 16,
    isRaining: true,
    icon: CloudRain,
    description: 'Intermittent showers; prioritizes covered walkways and indoor spots.',
    descriptionVi: 'Mưa rải rác; ưu tiên lối đi có mái che và các điểm dừng trong nhà.',
    badgeColor: 'bg-[#c2e7ff] text-[#001d35]',
    accentBg: 'hover:bg-[#c2e7ff]/30 active:bg-[#c2e7ff]/60',
    textColor: 'text-[#00639b]',
  },
  {
    id: 'heavy_rain',
    name: 'Heavy Downpour / Storm',
    nameVi: 'Mưa to / Bão giông',
    condition: 'Thunderstorm',
    tempC: 14,
    isRaining: true,
    icon: CloudLightning,
    description: 'Severe precipitation; suggests fully indoor museums, cafes, and galleries.',
    descriptionVi: 'Mưa lớn xối xả; gợi ý hoàn toàn bảo tàng, quán cà phê và phòng triển lãm trong nhà.',
    badgeColor: 'bg-[#004a77] text-white',
    accentBg: 'hover:bg-[#c2e7ff]/40 active:bg-[#c2e7ff]/70',
    textColor: 'text-[#004a77]',
  },
  {
    id: 'snow',
    name: 'Cold & Snowy',
    nameVi: 'Lạnh giá & Có tuyết',
    condition: 'Snow',
    tempC: 0,
    isRaining: false,
    icon: Snowflake,
    description: 'Freezing temperatures and snow flurries; favors warm indoor stops.',
    descriptionVi: 'Nhiệt độ đóng băng và tuyết rơi; ưu tiên các điểm dừng ấm áp trong nhà.',
    badgeColor: 'bg-[#e2eaf4] text-[#1d3557]',
    accentBg: 'hover:bg-[#e2eaf4]/60 active:bg-[#e2eaf4]',
    textColor: 'text-[#1d3557]',
  },
  {
    id: 'heatwave',
    name: 'Hot & Sunny / Heatwave',
    nameVi: 'Nắng gắt / Đợt nắng nóng',
    condition: 'Hot and Sunny',
    tempC: 35,
    isRaining: false,
    icon: Flame,
    description: 'Intense summer heat; minimizes strenuous walking during midday hours.',
    descriptionVi: 'Nắng hè gay gắt; giảm thiểu đi bộ vất vả vào những khung giờ giữa trưa.',
    badgeColor: 'bg-[#ffdad6] text-[#ba1a1a]',
    accentBg: 'hover:bg-[#ffdad6]/40 active:bg-[#ffdad6]/70',
    textColor: 'text-[#ba1a1a]',
  },
];

export const WeatherModal: React.FC<WeatherModalProps> = ({
  isOpen,
  onClose,
  currentWeather,
  onApplyWeather,
}) => {
  const { language } = useLanguage();
  const isVi = language === 'vi';

  useBodyScrollLock(isOpen);

  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    currentWeather?.isRaining
      ? currentWeather.condition.toLowerCase().includes('thunder')
        ? 'heavy_rain'
        : 'light_rain'
      : 'sunny'
  );
  const [autoReplan, setAutoReplan] = useState<boolean>(true);

  if (!isOpen) return null;

  const handleSelectAndApply = (preset: WeatherPreset) => {
    setSelectedPresetId(preset.id);
    const newWeather: LiveWeather = {
      tempC: preset.tempC,
      feelsLikeC: preset.tempC,
      condition: preset.condition,
      weatherCode: preset.isRaining ? 61 : 0,
      isRaining: preset.isRaining,
      precipitationMm: preset.isRaining ? (preset.id === 'heavy_rain' ? 8.5 : 2.0) : 0,
      windSpeedKmh: preset.id === 'heavy_rain' ? 28 : 12,
      humidity: preset.isRaining ? 85 : 45,
      city: currentWeather?.city || (isVi ? 'Điểm đến hiện tại' : 'Current Destination'),
      country: currentWeather?.country,
      updatedAt: new Date().toISOString(),
    };

    onApplyWeather(newWeather, autoReplan);
    onClose();
  };

  return (
    <div
      id="weather-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={(e) => {
        if ((e.target as HTMLElement).id === 'weather-modal-backdrop') {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-[28px] border border-[#e6ebf2] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#f0f4f9] text-[#191c20] px-6 py-4 flex items-center justify-between border-b border-[#e6ebf2]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center shrink-0 shadow-2xs">
              <Sun className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-wider text-[#44474e]">
                {isVi ? 'Điều kiện thời tiết chuyến đi' : 'Trip Conditions'}
              </div>
              <h3 className="text-base font-bold tracking-tight text-[#191c20]">
                {isVi ? 'Mô phỏng & Đặt thời tiết' : 'Set Current Weather'}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white hover:bg-[#e6ebf2] text-[#44474e] hover:text-[#191c20] flex items-center justify-center transition-colors border border-[#e6ebf2] cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs">
          <div className="flex items-center justify-between">
            <p className="text-[#44474e] text-xs">
              {isVi ? 'Chọn điều kiện thời tiết thực tế hoặc dự báo để cập nhật lịch trình:' : 'Select the current or forecast weather to update your travel conditions:'}
            </p>
            {currentWeather && (
              <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#f0f4f9] text-[#191c20] border border-[#c4c7cf]/60">
                {isVi ? 'Hiện tại' : 'Active'}: {currentWeather.tempC}°C, {currentWeather.condition}
              </span>
            )}
          </div>

          {/* Preset Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {PRESET_OPTIONS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = selectedPresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectAndApply(preset)}
                  className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 cursor-pointer flex flex-col justify-between gap-2.5 ${
                    isSelected
                      ? 'border-[#0b57d0] ring-2 ring-[#0b57d0]/20 bg-[#d3e3fd]/20'
                      : 'border-[#e6ebf2] bg-white ' + preset.accentBg
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-xl ${preset.badgeColor}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-[#191c20]">{isVi ? preset.nameVi : preset.name}</span>
                    </div>
                    <span className="font-mono text-xs font-bold text-[#44474e]">
                      {preset.tempC}°C
                    </span>
                  </div>

                  <p className="text-[11px] text-[#44474e] leading-relaxed">{isVi ? preset.descriptionVi : preset.description}</p>

                  <div className="flex items-center justify-between pt-1 border-t border-[#e6ebf2]/60">
                    <span className="text-[10px] text-[#74777f]">
                      {preset.isRaining ? (isVi ? '🌧️ Dự báo có mưa' : '🌧️ Rain expected') : (isVi ? '☀️ Điều kiện khô ráo' : '☀️ Dry conditions')}
                    </span>
                    {isSelected && (
                      <span className="text-[11px] font-bold text-[#0b57d0] flex items-center gap-0.5">
                        <Check className="w-3.5 h-3.5" />
                        {isVi ? 'Đang chọn' : 'Selected'}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Adaptation Toggle */}
          <div className="pt-2 border-t border-[#e6ebf2] flex items-center justify-between">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoReplan}
                onChange={(e) => setAutoReplan(e.target.checked)}
                className="w-4 h-4 rounded text-[#0b57d0] focus:ring-[#0b57d0]"
              />
              <span className="text-xs font-semibold text-[#191c20]">
                {isVi ? 'Tự động tính toán lại lịch trình theo thời tiết này' : 'Automatically re-evaluate itinerary for this weather'}
              </span>
            </label>
            <Sparkles className="w-4 h-4 text-[#0b57d0]" />
          </div>
        </div>
      </div>
    </div>
  );
};
