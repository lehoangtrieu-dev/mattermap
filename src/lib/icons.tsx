import React from 'react';
import {
  Compass,
  Utensils,
  Coffee,
  Footprints,
  Landmark,
  ShoppingBag,
  Sparkles,
  TreePine,
  Moon,
  CloudRain,
  Sun,
  Cloud,
  CloudLightning,
  Eye,
  Camera,
  Mic,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  RefreshCw,
  Navigation,
  Flame,
  ShieldAlert,
  ChevronRight,
  X,
  Plus,
  SlidersHorizontal,
  MapPin
} from 'lucide-react';
import { ItemCategory } from '../types';

export function getCategoryIcon(category: ItemCategory, className = 'w-4 h-4') {
  switch (category) {
    case 'sightseeing':
      return <Compass className={className} />;
    case 'food':
      return <Utensils className={className} />;
    case 'coffee':
      return <Coffee className={className} />;
    case 'walk':
      return <Footprints className={className} />;
    case 'museum':
      return <Landmark className={className} />;
    case 'shopping':
      return <ShoppingBag className={className} />;
    case 'relaxation':
      return <Sparkles className={className} />;
    case 'nature':
      return <TreePine className={className} />;
    case 'nightlife':
      return <Moon className={className} />;
    default:
      return <Compass className={className} />;
  }
}

export function getWeatherIcon(condition: string, isRaining: boolean, className = 'w-5 h-5') {
  if (isRaining || condition.toLowerCase().includes('rain') || condition.toLowerCase().includes('drizzle')) {
    return <CloudRain className={`${className} text-blue-500`} />;
  }
  if (condition.toLowerCase().includes('thunder')) {
    return <CloudLightning className={`${className} text-amber-500`} />;
  }
  if (condition.toLowerCase().includes('cloud') || condition.toLowerCase().includes('overcast')) {
    return <Cloud className={`${className} text-slate-400`} />;
  }
  return <Sun className={`${className} text-amber-500`} />;
}
