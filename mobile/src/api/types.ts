// Shapes returned by the DC Opportunities backend (/api/*). Only the fields
// the mobile app renders are typed; unknown fields are preserved as `extra`.

export type GeoPoint = { lat: number; lng: number };

export type Datacenter = GeoPoint & {
  id?: string;
  name?: string;
  operator?: string;
  tags?: Record<string, string>;
};

export type Property = GeoPoint & {
  id: string;
  name: string;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  area_m2?: number | null;
  estimated_power_mw?: number | null;
  sector?: string | null;
  for_sale?: boolean;
  price_eur?: number | null;
  listing_url?: string | null;
  data_source?: string | null;
  notes?: string | null;
  score?: { total_score?: number } | null;
};

// subsea-cables.json and landing-points.json are GeoJSON FeatureCollections.
export type GeoJSONFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    geometry: any;
    properties: Record<string, any>;
  }>;
};

export type LayerKey =
  | 'datacenters'
  | 'subseaCables'
  | 'landingPoints'
  | 'fiberBackbone'
  | 'properties'
  | 'commercial';

export type LedgerItem = Property & { key?: string; manual?: boolean };
