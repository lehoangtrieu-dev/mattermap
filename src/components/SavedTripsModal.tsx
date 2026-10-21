import React, { useEffect, useState } from 'react';
import {
  X,
  Calendar,
  MapPin,
  Trash2,
  ExternalLink,
  Loader2,
  FolderHeart,
  Clock,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  LogIn,
} from 'lucide-react';
import { SavedTrip } from '../types';
import { fetchUserSavedTrips, deleteSavedTrip } from '../lib/firebase';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useLoading } from '../context/LoadingContext';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface SavedTripsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoadTrip: (trip: SavedTrip) => void;
  onOpenSignIn: () => void;
}

export const SavedTripsModal: React.FC<SavedTripsModalProps> = ({
  isOpen,
  onClose,
  onLoadTrip,
  onOpenSignIn,
}) => {
  const { user } = useAuth();
  const { t, language } = useLanguage();
  const { showLoading, hideLoading } = useLoading();
  const isVi = language === 'vi';

  useBodyScrollLock(isOpen);

  const [trips, setTrips] = useState<SavedTrip[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [deletingTripId, setDeletingTripId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTrips = async () => {
    if (!user) {
      setTrips([]);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const userTrips = await fetchUserSavedTrips();
      setTrips(userTrips);
    } catch (err: any) {
      console.error('Error fetching saved trips:', err);
      setError(isVi ? 'Không thể tải danh sách chuyến đi. Vui lòng kiểm tra kết nối.' : 'Unable to load saved trips. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTrips();
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  const handleDelete = async (e: React.MouseEvent, tripId: string) => {
    e.stopPropagation();
    if (!window.confirm(isVi ? 'Bạn có chắc chắn muốn xóa chuyến đi đã lưu này không?' : 'Are you sure you want to delete this saved trip?')) {
      return;
    }

    setDeletingTripId(tripId);
    showLoading(
      isVi ? 'Đang xóa chuyến đi...' : 'Deleting Trip...',
      isVi ? 'Đang xóa dữ liệu chuyến đi khỏi đám mây...' : 'Removing trip from Firestore cloud database...'
    );
    try {
      await deleteSavedTrip(tripId);
      setTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (err) {
      console.error('Error deleting trip:', err);
      alert(isVi ? 'Không thể xóa chuyến đi. Vui lòng thử lại.' : 'Failed to delete trip. Please try again.');
    } finally {
      setDeletingTripId(null);
      hideLoading();
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00Z`);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString(isVi ? 'vi-VN' : undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white text-[#191c20] rounded-[28px] max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl border border-[#e6ebf2] overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#e6ebf2] flex items-center justify-between bg-[#f8f9fc]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center shadow-xs">
              <FolderHeart className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#191c20] tracking-tight">{t.common.mySavedPlans}</h2>
              <p className="text-xs text-[#44474e]">
                {user ? (isVi ? `Chuyến đi đám mây của ${user.displayName || user.email}` : `Cloud trips for ${user.displayName || user.email}`) : (isVi ? 'Đăng nhập để truy cập các lịch trình đã lưu' : 'Sign in to access your saved itineraries')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white hover:bg-[#ecf0f6] text-[#44474e] hover:text-[#191c20] flex items-center justify-center transition-colors border border-[#e6ebf2] cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs">
          {!user ? (
            /* Unauthenticated Prompt */
            <div className="py-12 px-4 text-center space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-full bg-[#d3e3fd] text-[#0b57d0] flex items-center justify-center mx-auto shadow-xs">
                <LogIn className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-bold text-[#191c20]">{isVi ? 'Đăng nhập để xem các chuyến đi' : 'Sign in to view your trips'}</h3>
                <p className="text-xs text-[#44474e] leading-relaxed">
                  {isVi
                    ? 'Kết nối tài khoản Google để đồng bộ, tra cứu và mở lại lịch trình trên mọi thiết bị bất cứ lúc nào.'
                    : 'Connect your Google account to sync, retrieve, and load your custom itineraries across devices anytime.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenSignIn();
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                <span>{isVi ? 'Đăng nhập bằng Google' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : isLoading ? (
            /* Loading State */
            <div className="py-16 text-center space-y-3">
              <Loader2 className="w-8 h-8 text-[#0b57d0] animate-spin mx-auto" />
              <p className="text-xs font-semibold text-[#44474e]">{isVi ? 'Đang tải danh sách chuyến đi từ Firestore...' : 'Fetching your saved trips from Firestore...'}</p>
            </div>
          ) : error ? (
            /* Error State */
            <div className="p-4 rounded-2xl bg-[#ffdad6] border border-[#ba1a1a]/30 text-[#410002] text-xs flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={loadTrips}
                className="px-3 py-1.5 rounded-full bg-white text-[#410002] font-bold border border-[#ba1a1a]/30 hover:bg-[#f8f9fc] cursor-pointer"
              >
                {t.common.retry}
              </button>
            </div>
          ) : trips.length === 0 ? (
            /* Empty State */
            <div className="py-14 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-[#ecf0f6] text-[#44474e] flex items-center justify-center mx-auto">
                <FolderHeart className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[#191c20]">{isVi ? 'Chưa có chuyến đi nào được lưu' : 'No saved trips yet'}</h3>
              <p className="text-xs text-[#44474e] max-w-sm mx-auto leading-relaxed">
                {isVi
                  ? 'Tạo một lịch trình cho bất kỳ thành phố nào và nhấn "Lưu chuyến đi" trên dòng thời gian để lưu vào tài khoản.'
                  : 'Generate an itinerary for any city and tap "Save Trip" on the timeline page to store it in your account.'}
              </p>
            </div>
          ) : (
            /* List of Saved Trips */
            <div className="space-y-3">
              {trips.map((trip) => {
                const totalStops = trip.days.reduce((acc, day) => acc + (day.items?.length || 0), 0);
                const verifiedStops = trip.days.reduce(
                  (acc, day) =>
                    acc + (day.items?.filter((i) => i.source === 'osm_verified' || i.osmVerified)?.length || 0),
                  0
                );

                return (
                  <div
                    key={trip.id}
                    className="p-4 rounded-[20px] bg-[#f8f9fc] hover:bg-[#f0f4f9] border border-[#e6ebf2] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:border-[#c4c7cf]"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-[#191c20] truncate">
                          {trip.destinationName}
                        </h4>
                        <span className="px-2 py-0.5 rounded-full bg-[#d3e3fd] text-[#041e49] font-bold text-[10px] whitespace-nowrap shrink-0">
                          {trip.daysCount} {isVi ? 'Ngày' : (trip.daysCount === 1 ? 'Day' : 'Days')}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[#44474e] text-[11px]">
                        {trip.startDate && (
                          <span className="flex items-center gap-1 whitespace-nowrap shrink-0">
                            <Calendar className="w-3 h-3 text-[#0b57d0]" />
                            {formatDate(trip.startDate)}
                          </span>
                        )}
                        <span className="flex items-center gap-1 whitespace-nowrap shrink-0">
                          <MapPin className="w-3 h-3 text-[#0b57d0]" />
                          {totalStops} {isVi ? 'điểm dừng' : 'stops'} ({verifiedStops} {isVi ? 'đã xác thực OSM' : 'OSM verified'})
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#e6ebf2]">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadTrip(trip);
                          onClose();
                        }}
                        className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-full bg-[#0b57d0] hover:bg-[#0842a0] text-white font-bold text-xs shadow-xs transition-all active:scale-95 cursor-pointer"
                      >
                        <span>{isVi ? 'Mở lịch trình' : 'Load Plan'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDelete(e, trip.id)}
                        disabled={deletingTripId === trip.id}
                        className="w-8 h-8 rounded-full bg-white hover:bg-[#ffdad6] text-[#74777f] hover:text-[#ba1a1a] flex items-center justify-center border border-[#e6ebf2] transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                        title="Delete Trip"
                      >
                        {deletingTripId === trip.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#e6ebf2] bg-white flex items-center justify-between text-xs text-[#44474e]">
          <span>{trips.length > 0 ? (isVi ? `${trips.length} lịch trình đã lưu` : `${trips.length} saved ${trips.length === 1 ? 'itinerary' : 'itineraries'}`) : ''}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full text-xs font-semibold text-[#191c20] hover:bg-[#ecf0f6] transition-colors cursor-pointer"
          >
            {isVi ? 'Đóng' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
