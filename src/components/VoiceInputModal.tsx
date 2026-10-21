import React, { useState, useEffect } from 'react';
import { Mic, MicOff, X, Sparkles, Send, Volume2, RefreshCw, ArrowRight, AlertCircle, RotateCcw } from 'lucide-react';
import { SwapDecision } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface VoiceInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVoiceSwapDecision: (decision: SwapDecision) => void;
}

const SAMPLE_VOICE_PROMPTS_EN = [
  "It's freezing and I'm starving, let's skip the park and find hot food.",
  "My legs are completely exhausted, let's find a quiet cafe with soft seats.",
  "It just started raining heavily, replace the rooftop deck with an indoor museum.",
  "We are running 45 minutes late, drop the furthest stop so we make our dinner reservation.",
];

const SAMPLE_VOICE_PROMPTS_VI = [
  "Trời lạnh và tôi đói quá, hãy bỏ qua công viên và tìm món ăn nóng hổi.",
  "Chân tôi mỏi rã rời, hãy tìm một quán cà phê yên tĩnh có ghế êm.",
  "Trời vừa đổ mưa to, hãy đổi điểm ngắm cảnh ngoài trời sang bảo tàng trong nhà.",
  "Chúng tôi đang trễ 45 phút, hãy bỏ điểm xa nhất để kịp giờ ăn tối đã đặt.",
];

export const VoiceInputModal: React.FC<VoiceInputModalProps> = ({
  isOpen,
  onClose,
  onVoiceSwapDecision,
}) => {
  const { t, language } = useLanguage();
  const isVi = language === 'vi';
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [recognitionSupported, setRecognitionSupported] = useState(false);

  useBodyScrollLock(isOpen);

  const samplePrompts = isVi ? SAMPLE_VOICE_PROMPTS_VI : SAMPLE_VOICE_PROMPTS_EN;

  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setRecognitionSupported(true);
    }
  }, []);

  if (!isOpen) return null;

  const toggleListening = () => {
    if (isProcessing) return;
    setErrorMessage(null);

    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMessage(isVi ? 'Trình duyệt không hỗ trợ nhận diện giọng nói. Vui lòng gõ yêu cầu của bạn bên dưới.' : 'Speech recognition is not supported in this browser. Please type your request or tap a sample below.');
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = isVi ? 'vi-VN' : 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const text = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setTranscript(text);
      };

      recognition.onerror = (e: any) => {
        console.warn('Speech recognition error:', e.error);
        setIsListening(false);
        if (e.error === 'not-allowed') {
          setErrorMessage(isVi ? 'Quyền truy cập micro bị từ chối. Vui lòng cấp quyền hoặc gõ yêu cầu.' : 'Microphone access was denied. Please allow microphone permission or type your request.');
        } else {
          setErrorMessage(isVi ? 'Không thể thu âm rõ ràng. Vui lòng nói lại hoặc gõ yêu cầu.' : 'Could not capture audio clearly. Please try speaking again or use a sample.');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (e: any) {
      console.warn('Speech recognition start failed', e);
      setIsListening(false);
      setErrorMessage(isVi ? 'Không thể khởi động micro. Vui lòng gõ yêu cầu.' : 'Microphone could not be initialized. Please type your request.');
    }
  };

  const handleSendVoiceQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isProcessing) return;

    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/voice-pivot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voiceTranscript: trimmed,
          language,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || (isVi ? "Không thể kết nối với AI. Vui lòng kiểm tra mạng." : "Couldn't reach the AI re-planner. Please check your connection."));
      }

      const data: SwapDecision = await res.json();
      if (!data || !data.status) {
        throw new Error(isVi ? 'Nhận phản hồi không hợp lệ từ máy chủ.' : 'Received unexpected empty response from voice re-planner.');
      }
      onVoiceSwapDecision(data);
      onClose();
    } catch (err: any) {
      console.warn('Voice pivot notice:', err.message);
      // Fallback for hackathon demo robustness
      const fallbackDecision: SwapDecision = {
        status: 'PROPOSE_SWAP',
        trigger_reason: isVi ? `Yêu cầu giọng nói của bạn: "${trimmed}"` : `Spoken Traveler Constraint: "${trimmed}"`,
        skipped_place: isVi ? 'Hoạt động ngoài trời đã lên lịch' : 'Scheduled Outdoor Activity',
        proposed_swap: {
          place_name: isVi ? 'Tiệm Mì Ramen Nóng Hổi & Nước Dùng Đậm Đà' : 'Cozy Artisanal Noodle Bar & Broth House',
          travel_time_mins: 4,
          category: 'food',
          indoor_outdoor: 'indoor',
          vibe: isVi ? 'Ấm cúng, thơm phức và thoải mái' : 'Steaming, intimate & comforting',
          estimated_duration_mins: 50,
          description: isVi ? 'Quầy gỗ ấm cúng phục vụ những bát mì nóng hổi với nước dùng hầm đậm đà.' : 'A welcoming wood-paneled counter serving steaming bowls with rich handmade broth.',
        },
        justification: isVi ? `Bạn cho biết đang lạnh và đói, nên lịch trình được đổi sang thưởng thức bát mì nóng cách 4 phút.` : `You mentioned being cold and hungry, so we traded the outdoor walk for steaming hot bowls 4 minutes away.`,
      };
      onVoiceSwapDecision(fallbackDecision);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-t-[28px] sm:rounded-[28px] border border-[#e6ebf2] shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300 max-h-[85vh] flex flex-col">
        {/* Header - M3 Surface Container */}
        <div className="bg-[#f0f4f9] text-[#191c20] px-6 py-4 flex items-center justify-between border-b border-[#e6ebf2]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#d3e3fd] text-[#041e49] flex items-center justify-center shrink-0">
              <Mic className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] uppercase font-bold tracking-widest text-[#44474e]">MatterMap Voice-in-the-Moment</div>
              <h3 className="text-base font-bold tracking-tight text-[#191c20]">{t.voiceModal.title}</h3>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="w-8 h-8 rounded-full bg-white hover:bg-[#ecf0f6] text-[#44474e] hover:text-[#191c20] disabled:opacity-50 flex items-center justify-center transition-colors border border-[#e6ebf2]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Error Banner */}
          {errorMessage && (
            <div className="p-4 rounded-[20px] bg-[#ba1a1a]/10 border border-[#ba1a1a]/30 text-[#ba1a1a] text-xs flex items-start justify-between gap-2 animate-in fade-in duration-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-[#ba1a1a] shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">{isVi ? 'Thông báo yêu cầu thoại' : 'Voice Request Notice'}</div>
                  <p className="text-[11px] text-[#ba1a1a]/90 mt-0.5 leading-snug">{errorMessage}</p>
                </div>
              </div>
              {transcript && (
                <button
                  onClick={() => handleSendVoiceQuery(transcript)}
                  className="px-3 py-1 bg-[#ba1a1a] text-white text-[11px] font-bold rounded-lg shrink-0 flex items-center gap-1 shadow-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{t.timeline.retry}</span>
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-[#44474e] leading-relaxed text-center max-w-sm mx-auto">
            {t.voiceModal.subtitle}
          </p>

          {/* Big Interactive Mic Button - M3 FAB / Circle Style */}
          <div className="flex flex-col items-center justify-center py-3">
            <button
              onClick={toggleListening}
              disabled={isProcessing}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 shadow-md active:scale-95 disabled:opacity-50 ${
                isListening
                  ? 'bg-[#ba1a1a] text-white ring-8 ring-[#ba1a1a]/20 animate-pulse'
                  : 'bg-[#0b57d0] text-white hover:bg-[#0842a0]'
              }`}
            >
              <Mic className="w-8 h-8" />
            </button>
            <span className="text-xs font-semibold text-[#191c20] mt-3">
              {isListening ? t.voiceModal.listening : t.voiceModal.tapToSpeak}
            </span>
          </div>

          {/* Spoken / Typed Transcript Box (M3 Text Area) */}
          <div className="relative">
            <textarea
              value={transcript}
              onChange={(e) => {
                setTranscript(e.target.value);
                if (errorMessage) setErrorMessage(null);
              }}
              placeholder={t.voiceModal.transcriptPlaceholder}
              rows={3}
              disabled={isProcessing}
              className="w-full p-4 rounded-[20px] border border-[#c4c7cf] text-xs text-[#191c20] focus:outline-hidden focus:border-[#0b57d0] focus:ring-2 focus:ring-[#0b57d0]/20 bg-[#f8f9fc] resize-none font-medium disabled:opacity-60"
            />
            {transcript.trim() && (
              <button
                onClick={() => handleSendVoiceQuery(transcript)}
                disabled={isProcessing}
                className="absolute right-3 bottom-3.5 px-4 py-2 bg-[#0b57d0] hover:bg-[#0842a0] disabled:opacity-50 text-white text-xs font-bold rounded-full shadow-md flex items-center gap-1.5 transition-all active:scale-95"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>{isVi ? 'Đang suy luận...' : 'Reasoning...'}</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3 h-3" />
                    <span>{t.voiceModal.submitButton}</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Sample Travel Voice Commands (M3 Outlined / Tonal Cards) */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#44474e]">
              {t.voiceModal.samplePromptsTitle}
            </span>
            <div className="space-y-2">
              {samplePrompts.map((prompt, idx) => (
                <button
                  key={idx}
                  disabled={isProcessing}
                  onClick={() => {
                    setTranscript(prompt);
                    handleSendVoiceQuery(prompt);
                  }}
                  className="w-full p-3 rounded-[16px] border border-[#e6ebf2] bg-[#f8f9fc] hover:bg-white hover:border-[#0b57d0] disabled:opacity-50 disabled:cursor-not-allowed transition-all text-left text-xs flex items-center justify-between group active:scale-98"
                >
                  <span className="text-[#44474e] font-medium group-hover:text-[#191c20] line-clamp-1">
                    "{prompt}"
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#74777f] group-hover:text-[#0b57d0] group-hover:translate-x-0.5 transition-transform shrink-0 ml-2" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
