'use client';

// Leaflet + OpenStreetMap wrapper for the geofence editor. Dynamic-imported
// by GeofenceEditorBody with ssr: false — Leaflet touches `window` at module
// scope and breaks SSR otherwise.
//
// Visual contract:
//   • Tile layer: OSM (no key, MIT). Attribution required + included below.
//   • Marker at center, draggable when interactive=true.
//   • Circle overlay with the configured radius (meters).
//   • Click anywhere on the tiles to move the center.
//
// Layout contract: the Leaflet container requires explicit height; we set it
// inline so callers can drop the component into any layout without remembering
// to add a `leaflet-container { height: ... }` rule.

import { useEffect, useMemo, useRef } from 'react';
import {
  MapContainer,
  Marker,
  Circle,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Webpack-imported asset URLs for Leaflet's default marker icon. Without these
// Leaflet tries to fetch the icons from `/`-relative URLs and 404s in Next.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Patch the default icon class once so every <Marker> picks up the bundled
// asset URLs. Type-safe: cast to a partial of the internal options bag.
const DefaultIcon = L.icon({
  iconRetinaUrl: (markerIcon2x as unknown as { src: string }).src ?? (markerIcon2x as unknown as string),
  iconUrl: (markerIcon as unknown as { src: string }).src ?? (markerIcon as unknown as string),
  shadowUrl: (markerShadow as unknown as { src: string }).src ?? (markerShadow as unknown as string),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type Props = {
  center: { lat: number; lng: number };
  radiusMeters: number;
  /** Fires when the marker is dragged or the map is clicked. */
  onCenterChange: (lat: number, lng: number) => void;
  /** When false, marker is not draggable and clicks are ignored. */
  interactive: boolean;
};

// Bridge component — re-centers the map when the parent's `center` prop
// changes (e.g. "Use current location" button click). react-leaflet doesn't
// re-render the underlying Leaflet map when MapContainer's `center` prop
// changes after mount, so we use the imperative API here.
function RecenterOnPropChange({
  center,
}: {
  center: { lat: number; lng: number };
}) {
  const map = useMap();
  const last = useRef({ lat: center.lat, lng: center.lng });

  useEffect(() => {
    if (last.current.lat !== center.lat || last.current.lng !== center.lng) {
      last.current = { lat: center.lat, lng: center.lng };
      map.setView([center.lat, center.lng], map.getZoom(), {
        animate: true,
      });
    }
  }, [center.lat, center.lng, map]);

  return null;
}

function MapClickHandler({
  onCenterChange,
  enabled,
}: {
  onCenterChange: (lat: number, lng: number) => void;
  enabled: boolean;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      onCenterChange(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function LocationGeofenceMap({
  center,
  radiusMeters,
  onCenterChange,
  interactive,
}: Props) {
  // Use sage tokens for the circle. Leaflet's path uses CSS color strings;
  // we read the tokens from the document so the visual stays in sync with
  // the design system at runtime (the tokens are CSS vars on :root).
  const circlePath = useMemo(
    () => ({
      color: 'var(--sage-deep)',
      weight: 2,
      fillColor: 'var(--sage)',
      fillOpacity: 0.18,
    }),
    [],
  );

  return (
    <div
      className="overflow-hidden rounded-md border border-line"
      style={{ height: 480, width: '100%' }}
    >
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={16}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker
          position={[center.lat, center.lng]}
          draggable={interactive}
          eventHandlers={{
            dragend(e) {
              const marker = e.target as L.Marker;
              const pos = marker.getLatLng();
              onCenterChange(pos.lat, pos.lng);
            },
          }}
        />
        <Circle
          center={[center.lat, center.lng]}
          radius={radiusMeters}
          pathOptions={circlePath}
        />
        <MapClickHandler onCenterChange={onCenterChange} enabled={interactive} />
        <RecenterOnPropChange center={center} />
      </MapContainer>
    </div>
  );
}
