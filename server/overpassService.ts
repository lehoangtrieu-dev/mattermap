/**
 * Overpass API & OpenStreetMap Service
 * Provides high-reliability batched POI fetching, mirror rotation with retries,
 * destination caching, local fuzzy matching, and graceful per-stop Photon geocoding fallback.
 */

import { evaluateOsmOpeningHours, OpeningHoursEvaluation } from '../src/lib/openingHours';

export interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  version: number;
  generator: string;
  elements: OsmElement[];
}

export interface EnrichedStopResult {
  source: 'osm_verified' | 'ai_estimate';
  osmVerified: boolean;
  lat: number;
  lng: number;
  verifiedAddress?: string;
  locationName: string;
  osmId?: string;
  osmType?: string;
  osmUrl?: string;
  openingHours?: OpeningHoursEvaluation | null;
  osmMetadata?: {
    cuisine?: string;
    website?: string;
    phone?: string;
    wheelchair?: string;
    wikidata?: string;
    wikipedia?: string;
    osmTags?: Record<string, string>;
  };
  matchScore?: number;
}

// In-memory cache for Overpass query results with 30-minute TTL
interface CacheEntry {
  timestamp: number;
  elements: OsmElement[];
  cityName?: string;
  bboxKey: string;
}

const overpassCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const OVERPASS_ENDPOINTS = [
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter', // Primary / most reliable mirror
  'https://overpass-api.de/api/interpreter',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/cgi/interpreter',
  'https://overpass.nchc.org.tw/api/interpreter',
];

// Rotating mirror index for load balancing across requests
let currentMirrorIndex = 0;

/**
 * Calculate distance between two coordinates in kilometers using Haversine formula
 */
function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Clean and normalize title for fuzzy matching against OSM names
 */
function cleanVenueTitle(rawTitle: string): string {
  if (!rawTitle) return '';
  return rawTitle
    .replace(/^Discovery & Signature Roast in\s+/i, '')
    .replace(/^Morning Bakery & Neighborhood Cafe\s+/i, '')
    .replace(/^Chef-Driven Bistro & Terrace Lunch\s+/i, '')
    .replace(/^Heritage Craft Studio & Design Boutiques\s+/i, '')
    .replace(/^Sunset Viewpoint & Twilight Lounge\s+/i, '')
    .replace(/^Contemporary Art Wing or Scenic Vista\s+/i, '')
    .replace(/^Regional Gastronomy & Market Hall\s+/i, '')
    .replace(/^Botanical Gardens or Waterfront Park\s+/i, '')
    .replace(/^Evening Refreshments & Dining Walk\s+/i, '')
    .replace(/^Iconic Landmark & Public Plaza\s+/i, '')
    .replace(/^Visit to\s+/i, '')
    .replace(/^Explore\s+/i, '')
    .replace(/^Tour of\s+/i, '')
    .replace(/^Stroll through\s+/i, '')
    .replace(/^Promenade through\s+/i, '')
    .replace(/\s+-\s+.*$/, '') // remove trailing suffix like " - Kyoto"
    .replace(/\s*\(.*?\)\s*/g, ' ') // remove parentheticals
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
    .trim();
}

/**
 * Compute token-based Jaccard similarity and string distance
 */
function calculateNameSimilarity(targetName: string, osmName: string): number {
  const cleanTarget = cleanVenueTitle(targetName);
  const cleanOsm = osmName.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').trim();

  if (!cleanTarget || !cleanOsm) return 0;

  // Direct exact match
  if (cleanTarget === cleanOsm) return 1.0;

  // Substring containment
  if (cleanOsm.includes(cleanTarget) || cleanTarget.includes(cleanOsm)) {
    const ratio = Math.min(cleanTarget.length, cleanOsm.length) / Math.max(cleanTarget.length, cleanOsm.length);
    return Math.max(0.78, ratio * 0.95);
  }

  // Token set matching
  const targetTokens = new Set(cleanTarget.split(/\s+/).filter((t) => t.length > 2));
  const osmTokens = new Set(cleanOsm.split(/\s+/).filter((t) => t.length > 2));

  if (targetTokens.size === 0 || osmTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of targetTokens) {
    if (osmTokens.has(token)) {
      intersection++;
    } else {
      // Partial prefix matching for multilingual transliterations
      for (const osmToken of osmTokens) {
        if (
          (token.length >= 4 && osmToken.startsWith(token.slice(0, 4))) ||
          (osmToken.length >= 4 && token.startsWith(osmToken.slice(0, 4)))
        ) {
          intersection += 0.75;
          break;
        }
      }
    }
  }

  const union = targetTokens.size + osmTokens.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Format real address string from OSM tags
 */
function formatOsmAddress(tags: Record<string, string>, fallbackCity: string): string {
  const parts: string[] = [];
  const house = tags['addr:housenumber'];
  const street = tags['addr:street'];
  const neighborhood = tags['addr:neighbourhood'] || tags['addr:suburb'] || tags['addr:district'];
  const city = tags['addr:city'] || fallbackCity;
  const postcode = tags['addr:postcode'];

  if (house && street) {
    parts.push(`${house} ${street}`);
  } else if (street) {
    parts.push(street);
  }

  if (neighborhood && neighborhood !== street && neighborhood !== city) {
    parts.push(neighborhood);
  }

  if (city) {
    parts.push(city);
  }

  if (postcode) {
    parts.push(postcode);
  }

  if (parts.length > 0) {
    return parts.join(', ');
  }

  // Fallback to name/location tag
  return tags.name ? `${tags.name}, ${fallbackCity}` : fallbackCity;
}

/**
 * Calculate bounding box (south, west, north, east) from destination center and stop coordinates
 */
function computeBoundingBox(
  destLat: number,
  destLng: number,
  stops?: Array<{ lat?: number; lng?: number }>
): { south: number; west: number; north: number; east: number; key: string } {
  let minLat = destLat - 0.06;
  let maxLat = destLat + 0.06;
  let minLng = destLng - 0.07;
  let maxLng = destLng + 0.07;

  if (stops && stops.length > 0) {
    for (const s of stops) {
      if (typeof s.lat === 'number' && !isNaN(s.lat) && s.lat !== 0) {
        minLat = Math.min(minLat, s.lat - 0.03);
        maxLat = Math.max(maxLat, s.lat + 0.03);
      }
      if (typeof s.lng === 'number' && !isNaN(s.lng) && s.lng !== 0) {
        minLng = Math.min(minLng, s.lng - 0.04);
        maxLng = Math.max(maxLng, s.lng + 0.04);
      }
    }
  }

  // Ensure minimum span of ~12km
  const latSpan = maxLat - minLat;
  const lngSpan = maxLng - minLng;
  if (latSpan < 0.10) {
    const midLat = (minLat + maxLat) / 2;
    minLat = midLat - 0.05;
    maxLat = midLat + 0.05;
  }
  if (lngSpan < 0.12) {
    const midLng = (minLng + maxLng) / 2;
    minLng = midLng - 0.06;
    maxLng = midLng + 0.06;
  }

  const south = parseFloat(minLat.toFixed(4));
  const west = parseFloat(minLng.toFixed(4));
  const north = parseFloat(maxLat.toFixed(4));
  const east = parseFloat(maxLng.toFixed(4));

  const key = `${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}`;
  return { south, west, north, east, key };
}

/**
 * Fetch batched OpenStreetMap data for a destination bounding box with retries and mirror rotation
 */
async function fetchBatchedOverpassData(
  destLat: number,
  destLng: number,
  cityName: string,
  stops?: Array<{ lat?: number; lng?: number }>
): Promise<OsmElement[]> {
  const { south, west, north, east, key: bboxKey } = computeBoundingBox(destLat, destLng, stops);
  const normalizedCityKey = cityName.toLowerCase().trim();
  const cacheKey = `city:${normalizedCityKey}_bbox:${bboxKey}`;
  const now = Date.now();

  // 1. Check in-memory cache
  const cached = overpassCache.get(cacheKey);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    console.log(`[Overpass Cache] HIT for ${cityName} (${cached.elements.length} OSM elements)`);
    return cached.elements;
  }

  // Also check if we have any active cache entry for this city name with >= 100 elements
  for (const entry of overpassCache.values()) {
    if (
      entry.cityName &&
      entry.cityName === normalizedCityKey &&
      now - entry.timestamp < CACHE_TTL_MS &&
      entry.elements.length > 50
    ) {
      console.log(`[Overpass Cache] City-key HIT for ${cityName} (${entry.elements.length} elements)`);
      return entry.elements;
    }
  }

  // 2. Build comprehensive Overpass query for all relevant POI categories inside the bounding box
  const query = `
[out:json][timeout:22];
(
  nw["tourism"~"attraction|museum|gallery|viewpoint|artwork|theme_park|zoo|aquarium|information|heritage|monument"](${south},${west},${north},${east});
  nw["amenity"~"restaurant|cafe|bar|pub|fast_food|arts_centre|theatre|cinema|place_of_worship|marketplace|ice_cream|bistro|food_court|biergarten"](${south},${west},${north},${east});
  nw["historic"~"monument|memorial|castle|ruins|archaeological_site|heritage|building|church|tomb|city_gate|fort|manor|palace|temple|shrine"](${south},${west},${north},${east});
  nw["leisure"~"park|garden|nature_reserve|square|plaza|water_park|pitch"](${south},${west},${north},${east});
  nw["shop"~"art|craft|books|gift|pastry|bakery|deli|clothes|boutique|tea|coffee|confectionery|souvenir|market|department_store"](${south},${west},${north},${east});
  nw["natural"~"beach|peak|volcano|cliff|waterfall|wood|bay|cave_entrance"](${south},${west},${north},${east});
);
out center tags 2500;
`.trim();

  const MAX_RETRIES = 2; // Up to 2 retries (3 total attempts)
  const TIMEOUT_MS = 14000; // 14s per attempt

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const mirrorIndex = attempt % OVERPASS_ENDPOINTS.length;
    const endpoint = OVERPASS_ENDPOINTS[mirrorIndex];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      if (attempt > 0) {
        console.log(`[Overpass API] Retry attempt ${attempt}/${MAX_RETRIES} rotating to mirror: ${endpoint}`);
        // Short delay before retrying
        await new Promise((resolve) => setTimeout(resolve, 600));
      } else {
        console.log(`[Overpass API] Sending batched query for "${cityName}" to mirror: ${endpoint}`);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'MatterMap/1.0 (travel-enrichment)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data: OverpassResponse = await response.json();
        if (data && Array.isArray(data.elements) && data.elements.length > 0) {
          console.log(
            `[Overpass API] Successfully fetched and cached ${data.elements.length} POIs for ${cityName} from ${endpoint}`
          );
          currentMirrorIndex = mirrorIndex; // Persist working mirror
          overpassCache.set(cacheKey, {
            timestamp: now,
            elements: data.elements,
            cityName: normalizedCityKey,
            bboxKey,
          });
          return data.elements;
        }
      } else {
        console.warn(`[Overpass API] Mirror ${endpoint} returned HTTP ${response.status} (${response.statusText})`);
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' || controller.signal.aborted) {
        console.warn(`[Overpass API] Request timed out on mirror: ${endpoint}`);
      } else {
        console.warn(`[Overpass API] Request failed on mirror ${endpoint}:`, err.message);
      }
    }
  }

  console.warn(`[Overpass API] All ${MAX_RETRIES + 1} Overpass mirror attempts completed without result for ${cityName}. Proceeding with per-stop fallback.`);
  return [];
}

/**
 * Match a single itinerary stop against the retrieved batched OSM elements
 */
function findBestOsmMatch(
  stop: {
    title: string;
    subtitle?: string;
    locationName?: string;
    lat?: number;
    lng?: number;
    category?: string;
  },
  osmElements: OsmElement[],
  destinationLat: number,
  destinationLng: number
): { element: OsmElement; score: number } | null {
  if (!osmElements || osmElements.length === 0) return null;

  let bestMatch: OsmElement | null = null;
  let highestScore = 0;

  const targetTitle = stop.title || '';
  const targetArea = stop.locationName || '';
  const stopLat = stop.lat || destinationLat;
  const stopLng = stop.lng || destinationLng;

  for (const el of osmElements) {
    if (!el.tags) continue;

    // Check all possible name tags in OSM
    const candidateNames = [
      el.tags.name,
      el.tags['name:en'],
      el.tags['name:es'],
      el.tags['name:fr'],
      el.tags['name:ja'],
      el.tags['name:de'],
      el.tags['name:it'],
      el.tags.alt_name,
      el.tags.official_name,
      el.tags.int_name,
      el.tags.loc_name,
      el.tags.brand,
      el.tags.operator,
    ].filter(Boolean) as string[];

    if (candidateNames.length === 0) continue;

    let maxNameSim = 0;
    for (const cName of candidateNames) {
      const sim = calculateNameSimilarity(targetTitle, cName);
      if (sim > maxNameSim) maxNameSim = sim;

      // Also check locationName / area substring match
      if (targetArea) {
        const areaSim = calculateNameSimilarity(targetArea, cName);
        if (areaSim * 0.85 > maxNameSim) maxNameSim = areaSim * 0.85;
      }
    }

    if (maxNameSim < 0.35) continue;

    // Proximity factor
    const elLat = el.lat ?? el.center?.lat;
    const elLng = el.lon ?? el.center?.lon;
    let proximityScore = 1.0;

    if (typeof elLat === 'number' && typeof elLng === 'number') {
      const distKm = haversineDistanceKm(stopLat, stopLng, elLat, elLng);
      if (distKm <= 3) {
        proximityScore = 1.2;
      } else if (distKm <= 8) {
        proximityScore = 1.0;
      } else if (distKm <= 18) {
        proximityScore = 0.85;
      } else {
        proximityScore = 0.6;
      }
    }

    const totalScore = maxNameSim * proximityScore;

    if (totalScore > highestScore) {
      highestScore = totalScore;
      bestMatch = el;
    }
  }

  // Threshold: at least 0.48 score for confident verification
  if (bestMatch && highestScore >= 0.48) {
    return { element: bestMatch, score: highestScore };
  }

  return null;
}

/**
 * Photon Geocoding fallback for a single stop when Overpass batch match is unavailable
 */
async function lookupStopWithPhoton(
  stopTitle: string,
  cityName: string,
  biasLat: number,
  biasLng: number
): Promise<OsmElement | null> {
  const cleanTitle = cleanVenueTitle(stopTitle);
  if (!cleanTitle || cleanTitle.length < 2) return null;

  const searchQuery = `${cleanTitle} ${cityName}`.trim();
  const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(searchQuery)}&lat=${biasLat}&lon=${biasLng}&limit=3&lang=en`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout per photon request

  try {
    const res = await fetch(photonUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.features) && data.features.length > 0) {
        for (const feature of data.features) {
          const coords = feature.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length >= 2) {
            const fLng = coords[0];
            const fLat = coords[1];
            const p = feature.properties || {};
            const pName = p.name || p.city || '';

            // Check distance (must be within reasonable proximity e.g. <= 35km of destination)
            const dist = haversineDistanceKm(biasLat, biasLng, fLat, fLng);
            if (dist <= 35) {
              const sim = calculateNameSimilarity(stopTitle, pName);
              if (sim >= 0.45 || (dist <= 10 && sim >= 0.35)) {
                return {
                  type: (p.osm_type === 'W' ? 'way' : p.osm_type === 'R' ? 'relation' : 'node') as 'node' | 'way' | 'relation',
                  id: p.osm_id || Math.floor(Math.random() * 1000000),
                  lat: fLat,
                  lon: fLng,
                  tags: {
                    name: p.name || stopTitle,
                    'addr:street': p.street,
                    'addr:housenumber': p.housenumber,
                    'addr:city': p.city || cityName,
                    'addr:postcode': p.postcode,
                    'addr:district': p.district,
                    ...(p.osm_key ? { [p.osm_key]: p.osm_value || 'yes' } : {}),
                  },
                };
              }
            }
          }
        }
      }
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    // Non-blocking catch
  }

  return null;
}

/**
 * Validate, correct, and enrich an array of itinerary items using batched Overpass OSM data
 * with graceful per-stop Photon fallback and non-blocking failure tolerance.
 */
export async function enrichItineraryWithOverpass(
  items: any[],
  destinationLat: number,
  destinationLng: number,
  cityName: string
): Promise<any[]> {
  if (!items || items.length === 0) return items;

  // Step 1: Send a single batched Overpass query for the whole destination area
  let batchedOsmElements: OsmElement[] = [];
  try {
    batchedOsmElements = await fetchBatchedOverpassData(destinationLat, destinationLng, cityName, items);
  } catch (err: any) {
    console.warn('[Overpass Service] Batched query caught exception (falling back to per-stop handling):', err.message);
  }

  // Step 2: Match each stop locally against the batched POI set
  // For stops without a match, proceed with individual Photon fallback in parallel without blocking others
  const enrichedPromises = items.map(async (item) => {
    const fallbackLat = item.lat ?? destinationLat;
    const fallbackLng = item.lng ?? destinationLng;

    // Try batched Overpass local match first
    let match = findBestOsmMatch(item, batchedOsmElements, destinationLat, destinationLng);
    let element: OsmElement | null = match ? match.element : null;
    let score = match ? match.score : 0;

    // If no match in batched Overpass, attempt quick Photon fallback for this specific stop
    if (!element) {
      try {
        const photonElement = await lookupStopWithPhoton(item.title, cityName, fallbackLat, fallbackLng);
        if (photonElement) {
          element = photonElement;
          score = 0.85;
          console.log(`[Photon Fallback] Verified "${item.title}" via Photon OpenStreetMap`);
        }
      } catch (photonErr: any) {
        // Continue gracefully without blocking
      }
    }

    if (element) {
      const tags = element.tags || {};
      const realLat = element.lat ?? element.center?.lat ?? fallbackLat;
      const realLng = element.lon ?? element.center?.lon ?? fallbackLng;
      const realAddress = formatOsmAddress(tags, cityName);
      const rawOpeningHours = tags.opening_hours || null;

      // Evaluate opening hours against planned stop time
      const openingHoursEval = evaluateOsmOpeningHours(
        rawOpeningHours,
        item.time,
        item.endTime,
        item.dayDate
      );

      const osmTypeStr = element.type;
      const osmIdStr = `${element.type}/${element.id}`;
      const osmUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;

      return {
        ...item,
        lat: realLat,
        lng: realLng,
        locationName: realAddress || item.locationName,
        verifiedAddress: realAddress,
        source: 'osm_verified' as const,
        osmVerified: true,
        osmId: osmIdStr,
        osmType: osmTypeStr,
        osmUrl,
        openingHours: openingHoursEval,
        osmMetadata: {
          cuisine: tags.cuisine,
          website: tags.website || tags['contact:website'],
          phone: tags.phone || tags['contact:phone'],
          wheelchair: tags.wheelchair,
          wikidata: tags.wikidata,
          wikipedia: tags.wikipedia,
          osmTags: tags,
        },
        matchConfidence: Math.round(score * 100),
      };
    }

    // No confident OSM match found -> keep Gemini estimate with flag
    return {
      ...item,
      lat: fallbackLat,
      lng: fallbackLng,
      source: 'ai_estimate' as const,
      osmVerified: false,
      openingHours: null,
    };
  });

  const results = await Promise.all(enrichedPromises);
  const verifiedCount = results.filter((r) => r.osmVerified).length;
  console.log(`[Enrichment Complete] ${verifiedCount} of ${results.length} stops verified with OpenStreetMap data`);

  return results;
}

/**
 * Validate and enrich a single proposed swap stop (from live pivot)
 */
export async function enrichSingleStopWithOverpass(
  proposedSwap: any,
  destinationLat: number,
  destinationLng: number,
  cityName: string
): Promise<any> {
  if (!proposedSwap) return proposedSwap;

  const targetLat = proposedSwap.lat || destinationLat;
  const targetLng = proposedSwap.lng || destinationLng;

  try {
    const osmElements = await fetchBatchedOverpassData(targetLat, targetLng, cityName);
    let match = findBestOsmMatch(
      {
        title: proposedSwap.place_name,
        lat: targetLat,
        lng: targetLng,
        category: proposedSwap.category,
      },
      osmElements,
      targetLat,
      targetLng
    );

    let element = match?.element || null;

    if (!element) {
      element = await lookupStopWithPhoton(proposedSwap.place_name, cityName, targetLat, targetLng);
    }

    if (element) {
      const tags = element.tags || {};
      const realLat = element.lat ?? element.center?.lat ?? targetLat;
      const realLng = element.lon ?? element.center?.lon ?? targetLng;
      const realAddress = formatOsmAddress(tags, cityName);
      const rawOpeningHours = tags.opening_hours || null;
      const openingHoursEval = evaluateOsmOpeningHours(rawOpeningHours);

      return {
        ...proposedSwap,
        lat: realLat,
        lng: realLng,
        verifiedAddress: realAddress,
        source: 'osm_verified',
        osmVerified: true,
        osmId: `${element.type}/${element.id}`,
        osmUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
        openingHours: openingHoursEval,
        osmMetadata: {
          cuisine: tags.cuisine,
          website: tags.website || tags['contact:website'],
          phone: tags.phone || tags['contact:phone'],
          wheelchair: tags.wheelchair,
        },
      };
    }
  } catch (err: any) {
    console.warn('[Overpass Service] Single stop enrichment notice:', err.message);
  }

  return {
    ...proposedSwap,
    source: 'ai_estimate',
    osmVerified: false,
  };
}

