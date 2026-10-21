export interface PhotonProperties {
  osm_id?: number;
  osm_type?: string;
  osm_key?: string;
  osm_value?: string;
  name?: string;
  city?: string;
  district?: string;
  locality?: string;
  county?: string;
  state?: string;
  country?: string;
  countrycode?: string;
  postcode?: string;
  street?: string;
  housenumber?: string;
  type?: string;
}

export interface PhotonFeature {
  geometry: {
    coordinates: [number, number]; // [lng, lat]
    type: string;
  };
  type: string;
  properties: PhotonProperties;
}

export interface PhotonResponse {
  type: string;
  features: PhotonFeature[];
}

export interface GeocodedPlaceSuggestion {
  id: string;
  displayName: string;
  primaryName: string;
  secondaryLabel: string;
  lat: number;
  lng: number;
  placeType?: string;
  rawProperties: PhotonProperties;
}

export const PRESET_DESTINATIONS: Array<{ name: string; lat: number; lng: number; country: string }> = [
  { name: 'Kyoto, Japan', lat: 35.0116, lng: 135.7681, country: 'Japan' },
  { name: 'Rome, Italy', lat: 41.9028, lng: 12.4964, country: 'Italy' },
  { name: 'Reykjavik, Iceland', lat: 64.1466, lng: -21.9426, country: 'Iceland' },
  { name: 'Barcelona, Spain', lat: 41.3874, lng: 2.1686, country: 'Spain' },
  { name: 'San Francisco, USA', lat: 37.7749, lng: -122.4194, country: 'United States' },
  { name: 'Hanoi, Vietnam', lat: 21.0285, lng: 105.8542, country: 'Vietnam' },
  { name: 'Vancouver, Canada', lat: 49.2827, lng: -123.1207, country: 'Canada' },
  { name: 'Oaxaca, Mexico', lat: 17.0732, lng: -96.7266, country: 'Mexico' },
];

export function formatPhotonFeature(feature: PhotonFeature, index: number): GeocodedPlaceSuggestion {
  const p = feature.properties || {};
  const [lng, lat] = feature.geometry?.coordinates || [0, 0];

  const primaryName = p.name || p.city || p.district || p.locality || p.state || p.country || 'Location';

  const secondaryParts: string[] = [];
  if (p.city && p.city !== primaryName) {
    secondaryParts.push(p.city);
  }
  if (p.district && p.district !== primaryName && p.district !== p.city) {
    secondaryParts.push(p.district);
  }
  if (p.state && p.state !== primaryName && p.state !== p.city) {
    secondaryParts.push(p.state);
  }
  if (p.country && p.country !== primaryName) {
    secondaryParts.push(p.country);
  }

  const secondaryLabel = secondaryParts.join(', ');
  const displayName = secondaryLabel ? `${primaryName}, ${secondaryLabel}` : primaryName;
  const id = `${p.osm_type || 'p'}-${p.osm_id || index}-${lat.toFixed(4)}-${lng.toFixed(4)}`;

  return {
    id,
    displayName,
    primaryName,
    secondaryLabel,
    lat,
    lng,
    placeType: p.type || p.osm_value || 'place',
    rawProperties: p,
  };
}

export async function searchPhotonPlaces(
  query: string,
  signal?: AbortSignal
): Promise<GeocodedPlaceSuggestion[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) {
    return [];
  }

  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=7&lang=en`;
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Photon geocoding returned HTTP ${response.status}`);
  }

  const data: PhotonResponse = await response.json();
  if (!data || !Array.isArray(data.features)) {
    return [];
  }

  return data.features
    .filter((f) => f.geometry && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length >= 2)
    .map((f, i) => formatPhotonFeature(f, i));
}
