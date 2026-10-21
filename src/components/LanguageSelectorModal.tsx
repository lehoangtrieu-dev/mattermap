import React, { useState, useEffect } from 'react';
import { Globe, Check, ArrowRight, LogIn } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useLoading } from '../context/LoadingContext';
import { Language } from '../locales';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface LanguageSelectorModalProps {
  isOpen: boolean;
  onClose?: () => void;
  canDismiss?: boolean;
}

export const LanguageSelectorModal: React.FC<LanguageSelectorModalProps> = ({
  isOpen,
  onClose,
  canDismiss = false,
}) => {
  const { language, setLanguage, t } = useLanguage();
  const { user, signIn } = useAuth();
  const { showLoading, hideLoading } = useLoading();
  const [selected, setSelected] = useState<Language>(language);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);

  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setSelected(language);
    }
  }, [isOpen, language]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsSaving(true);
    try {
      await setLanguage(selected);
      if (onClose) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignInAndConfirm = async () => {
    setIsSigningIn(true);
    showLoading(
      selected === 'vi' ? 'Đang đăng nhập Google...' : 'Signing in with Google...',
      selected === 'vi'
        ? 'Đang xác thực tài khoản và chuẩn bị không gian làm việc...'
        : 'Authenticating your account and preparing your travel workspace...'
    );
    try {
      await setLanguage(selected);
      await signIn();
      if (onClose) onClose();
    } catch (err) {
      console.warn('Sign-in notice from modal:', err);
    } finally {
      setIsSigningIn(false);
      hideLoading();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div
        className="bg-white text-[#191c20] rounded-none sm:rounded-[28px] max-w-lg w-full h-full sm:h-auto min-h-screen sm:min-h-0 p-6 sm:p-8 shadow-2xl border-0 sm:border border-[#e6ebf2] overflow-y-auto animate-in zoom-in-95 duration-200 relative flex flex-col justify-between sm:justify-start"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          {/* Header Icon & Bilingual Titles */}
          <div className="text-center space-y-3 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center mx-auto shadow-xs border border-[#c2e7ff]">
              <Globe className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h2 className="text-xl sm:text-2xl font-black text-[#191c20] tracking-tight">
                Choose your language <span className="text-[#74777f] font-normal">/</span> Chọn ngôn ngữ
              </h2>
              <p className="text-xs sm:text-sm text-[#44474e] leading-relaxed max-w-md mx-auto">
                Select your preferred language for itinerary planning, AI recommendations, and map navigation.
                <br />
                <span className="text-[11px] text-[#74777f]">
                  Chọn ngôn ngữ bạn muốn sử dụng cho việc lập lộ trình, gợi ý AI và dẫn đường bản đồ.
                </span>
              </p>
            </div>
          </div>

          {/* Language Options (Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-6">
            {/* English Option Card */}
            <button
              type="button"
              onClick={() => setSelected('en')}
              className={`p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer group active:scale-[0.98] ${
                selected === 'en'
                  ? 'border-[#0b57d0] bg-[#f0f4f9] shadow-sm'
                  : 'border-[#e6ebf2] hover:border-[#c4c7cf] bg-white hover:bg-[#fafafa]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-2xl select-none" role="img" aria-label="English">
                  🇺🇸
                </span>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    selected === 'en'
                      ? 'bg-[#0b57d0] text-white scale-100'
                      : 'border border-[#c4c7cf] text-transparent scale-90'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>

              <div>
                <p className="font-bold text-sm text-[#191c20] group-hover:text-[#0b57d0] transition-colors">
                  English
                </p>
              </div>
            </button>

            {/* Vietnamese Option Card */}
            <button
              type="button"
              onClick={() => setSelected('vi')}
              className={`p-4 rounded-2xl border-2 text-left transition-all relative flex flex-col justify-between cursor-pointer group active:scale-[0.98] ${
                selected === 'vi'
                  ? 'border-[#0b57d0] bg-[#f0f4f9] shadow-sm'
                  : 'border-[#e6ebf2] hover:border-[#c4c7cf] bg-white hover:bg-[#fafafa]'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-2xl select-none" role="img" aria-label="Tiếng Việt">
                  🇻🇳
                </span>
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    selected === 'vi'
                      ? 'bg-[#0b57d0] text-white scale-100'
                      : 'border border-[#c4c7cf] text-transparent scale-90'
                  }`}
                >
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                </div>
              </div>

              <div>
                <p className="font-bold text-sm text-[#191c20] group-hover:text-[#0b57d0] transition-colors">
                  Tiếng Việt
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Action Area: Sign In + Continue */}
        <div className="space-y-3 pt-2">
          {!user ? (
            <>
              <button
                type="button"
                onClick={handleSignInAndConfirm}
                disabled={isSigningIn || isSaving}
                className="w-full py-3.5 px-6 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2.5 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                <span>
                  {selected === 'vi' ? 'Đăng nhập với Google' : 'Sign in with Google'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSaving || isSigningIn}
                className="text-xs text-[#74777f] hover:text-[#191c20] hover:underline font-medium py-2 transition-colors cursor-pointer block mx-auto text-center disabled:opacity-50"
              >
                {selected === 'vi' ? 'Tiếp tục với tư cách Khách' : 'Continue as Guest'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isSaving || isSigningIn}
              className="w-full py-3 px-6 rounded-full font-bold text-sm bg-[#0b57d0] hover:bg-[#0842a0] text-white shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <span>
                {selected === 'vi' ? 'Tiếp tục với Tiếng Việt' : 'Continue in English'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
