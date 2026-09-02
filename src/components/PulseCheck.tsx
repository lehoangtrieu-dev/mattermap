import React, { useState } from 'react';
import { Zap, Coffee, BatteryLow, UtensilsCrossed, Compass, CloudRain, Clock, Sparkles } from 'lucide-react';
import { UserPulse } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface PulseCheckProps {
  currentPulse: UserPulse;
  isEvaluating: boolean;
  onSelectPulse: (pulse: UserPulse) => void;
}

export const PulseCheck: React.FC<PulseCheckProps> = ({
  currentPulse,
  isEvaluating,
  onSelectPulse,
}) => {
  const { t, language } = useLanguage();
  const isVi = language === 'vi';
  const [isOpen, setIsOpen] = useState(false);

  const pulses: { id: UserPulse; label: string; icon: React.ReactNode; desc: string }[] = [
    { id: 'great', label: t.pulseCheck.options.great.label, icon: <Zap className="w-3.5 h-3.5 text-amber-500" />, desc: t.pulseCheck.options.great.desc },
    { id: 'tired', label: t.pulseCheck.options.tired.label, icon: <BatteryLow className="w-3.5 h-3.5 text-orange-500" />, desc: t.pulseCheck.options.tired.desc },
    { id: 'hungry', label: t.pulseCheck.options.hungry.label, icon: <UtensilsCrossed className="w-3.5 h-3.5 text-red-500" />, desc: t.pulseCheck.options.hungry.desc },
    { id: 'bored', label: t.pulseCheck.options.bored.label, icon: <Compass className="w-3.5 h-3.5 text-purple-500" />, desc: t.pulseCheck.options.bored.desc },
    { id: 'cold_wet', label: t.pulseCheck.options.coldWet.label, icon: <CloudRain className="w-3.5 h-3.5 text-blue-500" />, desc: t.pulseCheck.options.coldWet.desc },
    { id: 'rushed', label: t.pulseCheck.options.rushed.label, icon: <Clock className="w-3.5 h-3.5 text-indigo-500" />, desc: t.pulseCheck.options.rushed.desc },
  ];

  const getPulseName = (pulse: UserPulse) => {
    switch (pulse) {
      case 'great': return t.pulseCheck.options.great.label;
      case 'tired': return t.pulseCheck.options.tired.label;
      case 'hungry': return t.pulseCheck.options.hungry.label;
      case 'bored': return t.pulseCheck.options.bored.label;
      case 'cold_wet': return t.pulseCheck.options.coldWet.label;
      case 'rushed': return t.pulseCheck.options.rushed.label;
      default: return pulse;
    }
  };

  return (
    <div className="fixed bottom-5 left-0 right-0 z-20 px-4 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        {/* Expanded Mood Selector Sheet / Pill Container (M3 Elevated Container) */}
        {isOpen && (
          <div className="mb-3 p-4 bg-white/95 backdrop-blur-md rounded-[28px] border border-[#e6ebf2] shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-[#191c20] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#0b57d0]" />
                {t.pulseCheck.title}
              </span>
              <span className="text-[10px] text-[#44474e] font-medium">{isVi ? 'Kích hoạt điều chỉnh AI tức thì' : 'Triggers live AI renegotiation'}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {pulses.map((p) => {
                const isSelected = currentPulse === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSelectPulse(p.id);
                      setIsOpen(false);
                    }}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-[16px] border text-center transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-[#0b57d0] text-white border-[#0b57d0] shadow-xs'
                        : 'bg-[#f8f9fc] hover:bg-white text-[#191c20] border-[#e6ebf2]'
                    }`}
                  >
                    <div className="mb-1">{p.icon}</div>
                    <span className="text-xs font-bold leading-tight">{p.label}</span>
                    <span className={`text-[9px] mt-0.5 line-clamp-2 ${isSelected ? 'text-white/80' : 'text-[#74777f]'}`}>
                      {p.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Floating Quick Action Bar (M3 Tonal Elevated Dock) */}
        <div className="flex items-center justify-between gap-2 p-2 bg-[#191c20] text-white rounded-full shadow-2xl border border-white/10">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="flex items-center gap-2.5 px-3.5 py-1.5 hover:bg-white/10 rounded-full transition-colors text-left"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#146c2e] border-2 border-white animate-ping" />
            <div>
              <div className="text-[9px] uppercase font-bold tracking-wider text-white/70 leading-none">
                {isVi ? 'Trạng thái' : 'Live Pulse'}
              </div>
              <div className="text-xs font-semibold text-white capitalize leading-tight flex items-center gap-1">
                {getPulseName(currentPulse)}
                <span className="text-[10px] text-white/60">▾</span>
              </div>
            </div>
          </button>

          {/* Quick Pulse Options (M3 Filter Chips) */}
          <div className="flex items-center gap-1.5 pr-1">
            <button
              onClick={() => onSelectPulse('tired')}
              disabled={isEvaluating}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                currentPulse === 'tired' ? 'bg-[#ffdcc2] text-[#6e3900]' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              😴 {isVi ? 'Mệt' : 'Tired'}
            </button>
            <button
              onClick={() => onSelectPulse('hungry')}
              disabled={isEvaluating}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                currentPulse === 'hungry' ? 'bg-[#ffdcc2] text-[#6e3900]' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              🍜 {isVi ? 'Đói' : 'Hungry'}
            </button>
            <button
              onClick={() => onSelectPulse('cold_wet')}
              disabled={isEvaluating}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all active:scale-95 ${
                currentPulse === 'cold_wet' ? 'bg-[#c2e7ff] text-[#001d35]' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              🌧️ {isVi ? 'Mưa/Lạnh' : 'Wet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
