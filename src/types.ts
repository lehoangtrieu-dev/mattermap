export type ItemCategory = 
  | 'sightseeing' 
  | 'food' 
  | 'coffee' 
  | 'walk' 
  | 'museum' 
  | 'shopping' 
  | 'relaxation' 
  | 'nature'
  | 'nightlife';

export type ItemStatus = 'completed' | 'active' | 'upcoming' | 'skipped' | 'swapped';

export type StopSource = 'osm_verified' | 'ai_estimate';

export interface OpeningHoursInfo {
  raw?: string;
  isOpen?: boolean | null;
  warning?: string | null;
  todayHoursText?: string;
  is24_7?: boolean;
}

export interface OsmMetadata {
  cuisine?: string;
  website?: string;
  phone?: string;
  wheelchair?: string;
  wikidata?: string;
  wikipedia?: string;
  osmTags?: Record<string, string>;
}

export interface ItineraryItem {
  id: string;
  dayNumber?: number; // 1, 2, 3...
  dayDate?: string; // e.g. "2026-08-22"
  time: string; // e.g. "14:30"
  endTime?: string; // e.g. "16:00"
  title: string;
  subtitle: string;
  category: ItemCategory;
  durationMins: number;
  locationName: string;
  lat?: number;
  lng?: number;
  indoorOutdoor: 'indoor' | 'outdoor';
  vibe: string;
  notes?: string;
  status: ItemStatus;
  swapReason?: string;
  originalItem?: Omit<ItineraryItem, 'originalItem'>;

  // OpenStreetMap (Overpass API) Validation & Enrichment
  source?: StopSource;
  osmVerified?: boolean;
  verifiedAddress?: string;
  osmId?: string;
  osmType?: string;
  osmUrl?: string;
  openingHours?: OpeningHoursInfo | null;
  osmMetadata?: OsmMetadata;
  matchConfidence?: number;
}

export interface DayPlan {
  dayNumber: number;
  date: string; // e.g. "2026-08-22"
  formattedDate: string; // e.g. "Aug 22"
  title?: string;
  theme?: string;
  items: ItineraryItem[];
}

export interface LiveWeather {
  tempC: number;
  feelsLikeC: number;
  condition: string;
  weatherCode: number;
  isRaining: boolean;
  precipitationMm: number;
  windSpeedKmh: number;
  humidity: number;
  city: string;
  country?: string;
  updatedAt: string;
}

export interface ProposedSwap {
  place_name: string;
  place_id?: string;
  travel_time_mins: number;
  lat?: number;
  lng?: number;
  category: ItemCategory;
  description: string;
  indoor_outdoor: 'indoor' | 'outdoor';
  vibe: string;
  estimated_duration_mins: number;
  source?: StopSource;
  osmVerified?: boolean;
  verifiedAddress?: string;
  openingHours?: OpeningHoursInfo | null;
  osmUrl?: string;
}

export interface SwapDecision {
  status: 'MAINTAIN_PLAN' | 'PROPOSE_SWAP';
  trigger_reason: string;
  skipped_place?: string;
  target_item_id?: string;
  proposed_swap?: ProposedSwap;
  justification: string;
}

export interface VisionCrowdResult {
  queueLengthEstimate: string;
  estimatedWaitMins: number;
  crowdDensity: 'low' | 'moderate' | 'heavy' | 'extreme';
  breaksBudget: boolean;
  visualAnalysis: string;
  swapDecision?: SwapDecision;
}

export type UserPulse = 'great' | 'tired' | 'hungry' | 'bored' | 'cold_wet' | 'rushed';

export interface TravelPreferences {
  skippedCategories: string[];
  preferredPace: 'relaxed' | 'moderate' | 'packed';
  dietaryOrPreferences: string;
}

export interface ToastMessage {
  id: string;
  type: 'info' | 'success' | 'alert' | 'error';
  title: string;
  desc?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export interface GeminiModelOption {
  displayName: string;
  id: string;
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  { displayName: 'Gemini 3.7 Flash', id: 'gemini-3.7-flash' },
  { displayName: 'Gemini 3.6 Flash', id: 'gemini-3.6-flash' },
  { displayName: 'Gemini 3.5 Flash', id: 'gemini-3.5-flash' },
  { displayName: 'Gemini 3.5 Flash-Lite', id: 'gemini-3.5-flash-lite' },
  { displayName: 'Gemini 3.1 Flash-Lite', id: 'gemini-3.1-flash-lite' },
  { displayName: 'Gemini 3 Flash (Preview)', id: 'gemini-3-flash-preview' },
];

export const DEFAULT_MODEL_ID = 'gemini-3.5-flash';

export interface SavedTrip {
  id: string;
  userId: string;
  destinationName: string;
  destinationLat: number;
  destinationLng: number;
  startDate: string;
  daysCount: number;
  days: DayPlan[];
  createdAt?: any;
  updatedAt?: any;
}

