import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  Camera,
  Mic,
  RefreshCw,
  FolderHeart,
  LogOut,
  User as UserIcon,
  Bot,
  Globe,
  Check,
} from 'lucide-react';
import { LiveWeather } from '../types';
import { getWeatherIcon } from '../lib/icons';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useLoading } from '../context/LoadingContext';
import { ModelSelector } from './ModelSelector';

interface HeaderProps {
  weather: LiveWeather | null;
  isLoadingWeather: boolean;
  onOpenWeatherModal: () => void;
  onOpenVisionModal: () => void;
  onOpenVoiceModal: () => void;
  onOpenSavedTrips: () => void;
  onBackToSearch: () => void;
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  weather,
  isLoadingWeather,
  onOpenWeatherModal,
  onOpenVisionModal,
  onOpenVoiceModal,
  onOpenSavedTrips,
  onBackToSearch,
  selectedModel,
  onSelectModel,
}) => {
  const { user, signIn, signOut } = useAuth();
  const { language, setLanguage, t, setIsLanguageModalOpen } = useLanguage();
  const { showLoading, hideLoading } = useLoading();
  const isVi = language === 'vi';
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignInClick = async () => {
    showLoading(
      isVi ? 'Đang đăng nhập...' : 'Signing in...',
      isVi ? 'Đang kết nối tài khoản Google của bạn...' : 'Connecting to your Google account...'
    );
    try {
      await signIn();
    } catch (err) {
      console.error('Sign-in error:', err);
    } finally {
      hideLoading();
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#e6ebf2] px-4 sm:px-6 lg:px-8 py-3 shadow-xs">
      <div className="flex items-center justify-between gap-3 w-full">
        {/* Clickable Back / Brand Navigation */}
        <button
          type="button"
          onClick={onBackToSearch}
          className="flex items-center gap-2 text-[#191c20] hover:text-[#0b57d0] transition-colors group text-left cursor-pointer focus:outline-none shrink-0"
          title={t.header.returnToSearch}
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#f0f4f9] group-hover:bg-[#d3e3fd] text-[#191c20] group-hover:text-[#041e49] flex items-center justify-center transition-all border border-[#e6ebf2]">
            <ChevronLeft className="w-5 h-5 transition-transform group-hover:-translate-x-0.5" />
          </div>
          {/* Responsive Brand Text - Hidden on small screens to preserve vital action bar space */}
          <span className="hidden sm:inline font-bold text-[#191c20] text-base sm:text-lg tracking-tight group-hover:text-[#0b57d0] transition-colors">
            {t.header.brandTitle}
          </span>
        </button>

        {/* Live Weather Display & Action Bar */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Clickable Live Weather Badge (Opens Dedicated Weather Modal) */}
          <button
            type="button"
            onClick={onOpenWeatherModal}
            title={t.header.weatherTooltip}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-95 cursor-pointer shadow-2xs ${
              weather?.isRaining
                ? 'bg-[#c2e7ff] hover:bg-[#b0dcfa] text-[#001d35] border-[#00639b]/30'
                : 'bg-[#f0f4f9] hover:bg-[#e6ebf2] text-[#191c20] border-[#c4c7cf]/70'
            }`}
          >
            {isLoadingWeather ? (
              <RefreshCw className="w-3.5 h-3.5 text-[#44474e] animate-spin" />
            ) : weather ? (
              <>
                {getWeatherIcon(weather.condition, weather.isRaining, 'w-3.5 h-3.5')}
                <span className="font-bold text-xs">{weather.tempC}°C</span>
                {weather.isRaining && (
                  <span className="text-xs text-[#00639b] font-bold hidden xs:inline">{t.common.rain}</span>
                )}
              </>
            ) : (
              <span className="text-xs text-[#44474e]">{t.common.weather}</span>
            )}
          </button>

          {/* Quick Multimodal: Camera Vision (M3 Icon Button) */}
          <button
            type="button"
            onClick={onOpenVisionModal}
            title={t.header.cameraTooltip}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#f0f4f9] hover:bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center transition-all active:scale-95 border border-[#e6ebf2] shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
          </button>

          {/* Quick Multimodal: Voice (M3 Icon Button) */}
          <button
            type="button"
            onClick={onOpenVoiceModal}
            title={t.header.voiceTooltip}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#f0f4f9] hover:bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center transition-all active:scale-95 border border-[#e6ebf2] shrink-0 cursor-pointer"
          >
            <Mic className="w-4 h-4" />
          </button>

          {/* Compact Account Avatar / Profile & Settings Popup */}
          <div className="relative ml-0.5" ref={menuRef}>
            <button
              type="button"
              onClick={() => setIsMenuOpen((prev) => !prev)}
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

            {/* Account & AI Preferences Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-white border border-[#e6ebf2] shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                {/* User Identity / Sign-in Header */}
                <div className="px-4 py-2.5 border-b border-[#e6ebf2]">
                  {user ? (
                    <div>
                      <p className="font-bold text-[#191c20] text-xs truncate">
                        {user.displayName || 'Google Account'}
                      </p>
                      <p className="text-[11px] text-[#74777f] truncate">{user.email}</p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-bold text-[#191c20] text-xs">{t.common.guestMode}</p>
                        <p className="text-[11px] text-[#74777f]">{t.header.signInToSync}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          setIsMenuOpen(false);
                          await handleSignInClick();
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white text-xs font-bold transition-all cursor-pointer shadow-2xs"
                      >
                        {t.common.signIn}
                      </button>
                    </div>
                  )}
                </div>

                {/* Saved Trip Plans Quick Link (Moved above Language) */}
                <div className="py-1 border-b border-[#e6ebf2]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMenuOpen(false);
                      onOpenSavedTrips();
                    }}
                    className="w-full px-4 py-2.5 flex items-center gap-2.5 text-left hover:bg-[#f0f4f9] text-[#191c20] font-semibold transition-colors cursor-pointer"
                  >
                    <FolderHeart className="w-4 h-4 text-[#0b57d0]" />
                    <span>{t.common.mySavedPlans}</span>
                  </button>
                </div>

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

                {/* AI Intelligence Model Selector */}
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

                {/* Sign Out Action (if signed in) */}
                {user && (
                  <div className="pt-1 border-t border-[#e6ebf2]">
                    <button
                      type="button"
                      onClick={async () => {
                        setIsMenuOpen(false);
                        showLoading(
                          isVi ? 'Đang đăng xuất...' : 'Signing out...',
                          isVi ? 'Đang lưu phiên làm việc và đăng xuất an toàn...' : 'Safely signing out of your account...'
                        );
                        try {
                          await signOut();
                        } finally {
                          hideLoading();
                        }
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
      </div>
    </header>
  );
};



