import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreglWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import {
  Maximize2,
  Minimize2,
  Layers,
  Compass,
  MapPin,
  Calendar,
  EyeOff,
} from 'lucide-react';
import { ItineraryItem } from '../types';
import { useLanguage } from '../context/LanguageContext';

// Set worker URL explicitly to guarantee worker resolves correctly in dev and production standalone builds
if (typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl(maplibreglWorkerUrl);
}

export interface ItineraryMapProps {
  items: ItineraryItem[];
  activeDayNumber?: number;
  totalDays?: number;
  onDayChange?: (dayNum: number) => void;
  selectedItemId?: string | null;
  onCenteringComplete?: () => void;
  inProgressItemId?: string | null;
  completedItemIds?: Set<string>;
  onSelectItem?: (item: ItineraryItem) => void;
  destinationName?: string;
  className?: string;
  isCompact?: boolean;
  onToggleExpand?: () => void;
  isExpanded?: boolean;
  onHideMap?: () => void;
}

// Tile Styles (OpenFreeMap & OpenStreetMap — 100% Free, Zero API Key Required, Absolute HTTPS URLs)
const TILE_STYLES = {
  positron: {
    name: 'OpenFreeMap',
    style: 'https://tiles.openfreemap.org/styles/positron',
  },
  bright: {
    name: 'OpenFreeMap Bright',
    style: 'https://tiles.openfreemap.org/styles/bright',
  },
  osm: {
    name: 'OpenStreetMap',
    style: {
      version: 8 as const,
      sources: {
        'osm-standard': {
          type: 'raster' as const,
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          maxzoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        },
      },
      layers: [
        {
          id: 'osm-standard-layer',
          type: 'raster' as const,
          source: 'osm-standard',
          minzoom: 0,
          maxzoom: 24,
        },
      ],
    },
  },
};

export const ItineraryMap: React.FC<ItineraryMapProps> = ({
  items,
  activeDayNumber = 1,
  totalDays = 1,
  onDayChange,
  selectedItemId,
  onCenteringComplete,
  inProgressItemId,
  completedItemIds,
  onSelectItem,
  className = '',
  isCompact = false,
  onToggleExpand,
  isExpanded = false,
  onHideMap,
}) => {
  const { language } = useLanguage();
  const isVi = language === 'vi';

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<{ [id: string]: maplibregl.Marker }>({});
  const lastFittedDayRef = useRef<number | null>(null);
  const lastCenteredItemIdRef = useRef<string | null>(null);

  const [activeTileStyle, setActiveTileStyle] = useState<'positron' | 'bright' | 'osm'>('positron');
  const [mapLoaded, setMapLoaded] = useState<boolean>(false);

  // Filter items for the currently displayed day
  const dayItems = items.filter((item) => (item.dayNumber || 1) === activeDayNumber);
  // Valid items with numeric coordinates
  const validDayItems = dayItems.filter(
    (item) =>
      typeof item.lat === 'number' &&
      typeof item.lng === 'number' &&
      !isNaN(item.lat) &&
      !isNaN(item.lng) &&
      item.lat !== 0 &&
      item.lng !== 0
  );

  // 1. Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Determine initial center
    const firstValid = validDayItems[0] || items.find((i) => typeof i.lat === 'number' && typeof i.lng === 'number');
    const initialCenter: [number, number] = firstValid && firstValid.lng && firstValid.lat
      ? [firstValid.lng, firstValid.lat]
      : [139.7005, 35.6595]; // Default fallback center

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: TILE_STYLES[activeTileStyle].style,
      center: initialCenter,
      zoom: 13.5,
      maxZoom: 20,
      attributionControl: {
        compact: true,
      },
    });

    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');

    map.on('load', () => {
      setMapLoaded(true);
    });

    map.on('error', (e) => {
      const errDetail = e.error ? (e.error.message || String(e.error)) : JSON.stringify(e);
      console.warn('[MapLibre GL Notice]:', errDetail);
      // If vector tile server has an issue, seamlessly fallback to OSM raster tiles
      if (activeTileStyle !== 'osm' && (errDetail.includes('Failed to fetch') || errDetail.includes('404') || errDetail.includes('NetworkError'))) {
        console.info('[MapLibre GL] Switching to OpenStreetMap raster tiles fallback.');
        setActiveTileStyle('osm');
        map.setStyle(TILE_STYLES.osm.style as any);
      }
    });

    mapInstanceRef.current = map;

    // Resize observer to handle container dimension changes cleanly
    const resizeObserver = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.resize();
      }
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      Object.values(markersRef.current).forEach((m: unknown) => {
        if (m && typeof (m as maplibregl.Marker).remove === 'function') {
          (m as maplibregl.Marker).remove();
        }
      });
      markersRef.current = {};
      map.remove();
      mapInstanceRef.current = null;
      setMapLoaded(false);
    };
  }, []); // Run once on mount

  // 2. Handle Tile Style Switch
  const switchTileStyle = (styleKey: 'positron' | 'bright' | 'osm') => {
    if (!mapInstanceRef.current || activeTileStyle === styleKey) return;
    setActiveTileStyle(styleKey);
    const targetStyle = TILE_STYLES[styleKey].style;
    mapInstanceRef.current.setStyle(targetStyle as any);
  };

  // 3. Update Markers & Route Path whenever Day Items, Pivoted Items, or Item Statuses Change (Real-Time)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded) return;

    // Clear old markers
    Object.values(markersRef.current).forEach((marker: unknown) => {
      if (marker && typeof (marker as maplibregl.Marker).remove === 'function') {
        (marker as maplibregl.Marker).remove();
      }
    });
    markersRef.current = {};

    if (validDayItems.length === 0) return;

    // A. Add Markers with Visible Stop Labels & Direct Details Modal Trigger without zoom
    // Marker color is driven purely by status (in-progress, completed, upcoming), NOT by selection/centering
    validDayItems.forEach((item, index) => {
      const isInProgress = inProgressItemId === item.id;
      const isCompleted = completedItemIds ? completedItemIds.has(item.id) : item.status === 'completed';

      // Create Custom Pin Element
      const el = document.createElement('div');
      el.className = 'mattermap-marker-container cursor-pointer select-none';
      el.id = `map-marker-${item.id}`;

      // Build Marker HTML with direct visible name label & completed/in-progress styling
      el.innerHTML = `
        <div class="relative flex flex-col items-center group">
          <!-- Pulsing Beacon for In-Progress Stop -->
          ${
            isInProgress
              ? `<div class="absolute -top-2 w-10 h-10 rounded-full bg-[#0b57d0]/30 animate-ping pointer-events-none"></div>
                 <div class="absolute -top-1 w-8 h-8 rounded-full bg-[#0b57d0]/20 animate-pulse pointer-events-none"></div>`
              : ''
          }

          <!-- Pin Head Badge -->
          <div class="relative flex items-center justify-center transition-all duration-200 transform group-hover:scale-110 ${
            isInProgress
              ? 'w-7 h-7 rounded-full bg-[#0b57d0] text-white shadow-md ring-2 ring-white border-2 border-[#0b57d0] z-30 scale-105'
              : isCompleted
              ? 'w-6 h-6 rounded-full bg-[#5f6368] text-white shadow-xs border-2 border-white z-10 opacity-90'
              : 'w-6 h-6 rounded-full bg-white text-[#191c20] shadow-sm border-2 border-[#191c20] group-hover:border-[#0b57d0] group-hover:text-[#0b57d0] z-10'
          }">
            ${
              isCompleted
                ? `<svg class="w-3 h-3 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>`
                : `<span class="text-[11px] font-bold font-sans">${index + 1}</span>`
            }
          </div>

          <!-- Pin Pointer Needle -->
          <div class="w-0 h-0 border-x-3.5 border-x-transparent border-t-5 ${
            isInProgress
              ? 'border-t-[#0b57d0]'
              : isCompleted
              ? 'border-t-[#5f6368]'
              : 'border-t-[#191c20] group-hover:border-t-[#0b57d0]'
          } -mt-[1px]"></div>

          <!-- Visible Stop Name Label directly on marker -->
          <div class="mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-bold shadow-xs max-w-[140px] truncate text-center border pointer-events-none transition-all ${
            isInProgress
              ? 'bg-[#0b57d0] text-white border-[#0b57d0]'
              : isCompleted
              ? 'bg-[#f0f4f9] text-[#5f6368] border-[#c4c7cf]/80 line-through opacity-85'
              : 'bg-white/95 text-[#191c20] border-[#c4c7cf]/90 group-hover:border-[#0b57d0] group-hover:text-[#0b57d0]'
          }">
            ${item.title}
          </div>
        </div>
      `;

      const marker = new maplibregl.Marker({
        element: el,
        anchor: 'bottom',
      })
        .setLngLat([item.lng!, item.lat!])
        .addTo(map);

      // Marker click behavior: Open Stop Details without zooming in (pan only)
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onSelectItem?.(item);
        map.panTo([item.lng!, item.lat!], {
          duration: 500,
        });
      });

      markersRef.current[item.id] = marker;
    });

    // B. Draw/Update Route Sequence Line (GeoJSON LineString)
    const coordinates: [number, number][] = validDayItems.map((item) => [item.lng!, item.lat!]);

    const updateRouteLine = () => {
      const source = map.getSource('day-route-line') as maplibregl.GeoJSONSource | undefined;
      const geojsonData: GeoJSON.Feature<GeoJSON.LineString> = {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: coordinates.length >= 2 ? coordinates : [],
        },
      };

      if (source) {
        source.setData(geojsonData);
      } else if (map.isStyleLoaded()) {
        map.addSource('day-route-line', {
          type: 'geojson',
          data: geojsonData,
        });

        // 1. Shadow / Casing line underneath
        map.addLayer({
          id: 'day-route-line-casing',
          type: 'line',
          source: 'day-route-line',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#ffffff',
            'line-width': 6,
            'line-opacity': 0.95,
          },
        });

        // 2. Main dashed itinerary connector line
        map.addLayer({
          id: 'day-route-line-main',
          type: 'line',
          source: 'day-route-line',
          layout: {
            'line-join': 'round',
            'line-cap': 'round',
          },
          paint: {
            'line-color': '#0b57d0',
            'line-width': 3.5,
            'line-dasharray': [2, 1.5],
            'line-opacity': 0.9,
          },
        });
      }
    };

    if (map.isStyleLoaded()) {
      updateRouteLine();
    } else {
      map.once('style.load', updateRouteLine);
    }
  }, [items, activeDayNumber, inProgressItemId, completedItemIds, mapLoaded, activeTileStyle]);

  // 4. Auto-fit bounds ONLY once on initial load or when selected day changes (preserves manual user pan/zoom)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapLoaded || validDayItems.length === 0) return;

    if (lastFittedDayRef.current !== activeDayNumber) {
      lastFittedDayRef.current = activeDayNumber;
      const bounds = new maplibregl.LngLatBounds();
      validDayItems.forEach((item) => bounds.extend([item.lng!, item.lat!]));
      map.fitBounds(bounds, {
        padding: { top: 70, bottom: 70, left: 60, right: 60 },
        maxZoom: 15.5,
        duration: 800,
      });
    }
  }, [mapLoaded, activeDayNumber, validDayItems.length]);

  // 5. Focus on centered/selected item when triggered (Pan and zoom to street level once only, no persistent lock)
  useEffect(() => {
    if (!selectedItemId || !mapInstanceRef.current || !mapLoaded) return;
    if (lastCenteredItemIdRef.current === selectedItemId) return;

    const targetItem = validDayItems.find((i) => i.id === selectedItemId);
    if (targetItem && targetItem.lng && targetItem.lat) {
      lastCenteredItemIdRef.current = selectedItemId;
      mapInstanceRef.current.easeTo({
        center: [targetItem.lng, targetItem.lat],
        zoom: 15.5,
        duration: 600,
      });
      // Clear centering trigger so future re-renders never snap back
      onCenteringComplete?.();
    }
  }, [selectedItemId, mapLoaded, validDayItems, onCenteringComplete]);

  // Handler to fit all stops
  const handleFitAllStops = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map || validDayItems.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    validDayItems.forEach((item) => bounds.extend([item.lng!, item.lat!]));
    map.fitBounds(bounds, {
      padding: { top: 70, bottom: 70, left: 60, right: 60 },
      maxZoom: 15.5,
      duration: 800,
    });
  }, [validDayItems]);

  return (
    <div
      className={`relative w-full rounded-[24px] overflow-hidden border border-[#e6ebf2] bg-[#f8f9fc] flex flex-col shadow-xs transition-all duration-300 ${
        isExpanded ? 'h-[580px] sm:h-[640px]' : isCompact ? 'h-[280px] sm:h-[340px]' : 'h-[380px] sm:h-[480px] lg:h-[540px]'
      } ${className}`}
    >
      {/* Map Header Toolbar (M3 Glass Container) */}
      <div className="absolute top-3 left-3 right-14 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Day Selector Tabs */}
        <div className="flex items-center gap-1 p-1 bg-white/95 backdrop-blur-md rounded-full border border-[#c4c7cf]/60 shadow-md pointer-events-auto max-w-full overflow-x-auto no-scrollbar">
          {totalDays > 1 ? (
            Array.from({ length: totalDays }, (_, i) => i + 1).map((dNum) => {
              const isActive = dNum === activeDayNumber;
              return (
                <button
                  key={dNum}
                  type="button"
                  onClick={() => onDayChange?.(dNum)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#0b57d0] text-white shadow-xs'
                      : 'bg-[#ecf0f6] text-[#44474e] hover:bg-[#d3e3fd]/60'
                  }`}
                >
                  {isVi ? `Ngày ${dNum}` : `Day ${dNum}`}
                </button>
              );
            })
          ) : (
            <div className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-[#191c20]">
              <Calendar className="w-3.5 h-3.5 text-[#0b57d0]" />
              <span>{isVi ? `Ngày ${activeDayNumber}` : `Day ${activeDayNumber}`}</span>
            </div>
          )}
        </div>

        {/* Right Action Tools: Hide Map (Mobile Only), Re-center & Tile Style Switcher */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* Hide Map Button inside the map panel (only rendered on mobile when onHideMap is passed) */}
          {onHideMap && (
            <button
              type="button"
              onClick={onHideMap}
              title={isVi ? 'Ẩn bản đồ' : 'Hide Map'}
              className="lg:hidden px-2.5 py-1.5 bg-white/95 backdrop-blur-md hover:bg-white text-[#191c20] hover:text-[#ba1a1a] rounded-full border border-[#c4c7cf]/60 shadow-md transition-all active:scale-95 flex items-center gap-1 text-xs font-semibold cursor-pointer"
            >
              <EyeOff className="w-3.5 h-3.5 text-[#44474e]" />
              <span>{isVi ? 'Ẩn bản đồ' : 'Hide Map'}</span>
            </button>
          )}

          {/* Fit Bounds Button */}
          <button
            type="button"
            onClick={handleFitAllStops}
            title={isVi ? 'Căn chỉnh vừa vặn tất cả điểm dừng' : 'Fit all stops in view'}
            className="p-2 bg-white/95 backdrop-blur-md hover:bg-white text-[#191c20] rounded-full border border-[#c4c7cf]/60 shadow-md transition-all active:scale-95 flex items-center justify-center cursor-pointer"
          >
            <Compass className="w-4 h-4 text-[#0b57d0]" />
          </button>

          {/* Tile Layer Toggle */}
          <button
            type="button"
            onClick={() => {
              const nextStyle =
                activeTileStyle === 'positron'
                  ? 'bright'
                  : activeTileStyle === 'bright'
                  ? 'osm'
                  : 'positron';
              switchTileStyle(nextStyle);
            }}
            title={isVi ? 'Chuyển đổi lớp bản đồ' : `Switch to ${
              activeTileStyle === 'positron'
                ? 'OpenFreeMap Bright'
                : activeTileStyle === 'bright'
                ? 'OpenStreetMap'
                : 'OpenFreeMap'
            } tiles`}
            className="px-2.5 py-1.5 bg-white/95 backdrop-blur-md hover:bg-white text-[#191c20] rounded-full border border-[#c4c7cf]/60 shadow-md transition-all active:scale-95 flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-[#0b57d0]" />
            <span className="hidden sm:inline">{TILE_STYLES[activeTileStyle].name}</span>
          </button>

          {/* Expand/Collapse Map Toggle (if handler provided) */}
          {onToggleExpand && (
            <button
              type="button"
              onClick={onToggleExpand}
              title={isExpanded ? (isVi ? 'Thu nhỏ bản đồ' : 'Collapse Map') : (isVi ? 'Phóng to bản đồ' : 'Expand Map')}
              className="p-2 bg-white/95 backdrop-blur-md hover:bg-white text-[#191c20] rounded-full border border-[#c4c7cf]/60 shadow-md transition-all active:scale-95 flex items-center justify-center cursor-pointer"
            >
              {isExpanded ? <Minimize2 className="w-4 h-4 text-[#44474e]" /> : <Maximize2 className="w-4 h-4 text-[#44474e]" />}
            </button>
          )}
        </div>
      </div>

      {/* Map Canvas Viewport */}
      <div ref={mapContainerRef} className="w-full h-full min-h-full flex-1" />

      {/* Empty State Warning if Day has no items with valid coords */}
      {validDayItems.length === 0 && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center p-6 text-center z-10">
          <div className="max-w-xs space-y-2">
            <MapPin className="w-8 h-8 text-[#74777f] mx-auto opacity-60" />
            <p className="text-sm font-semibold text-[#191c20]">
              {isVi ? `Chưa có tọa độ điểm dừng cho Ngày ${activeDayNumber}` : `No stops with coordinates for Day ${activeDayNumber}`}
            </p>
            <p className="text-xs text-[#74777f]">
              {isVi ? 'Các điểm dừng sẽ tự động hiển thị khi được lên lịch.' : 'Stops will display automatically once scheduled.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
