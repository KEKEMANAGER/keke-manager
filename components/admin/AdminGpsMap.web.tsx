import { createElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { loadLeaflet } from '../../lib/loadLeaflet.web';
import {
  adminGpsMarkerColor,
  adminGpsMarkerEmoji,
  isAdminGpsActive,
  type AdminGpsDriverLocation,
} from '../../lib/adminGps';

const TBILISI: [number, number] = [41.6938, 44.8015];
const DEFAULT_ZOOM = 12;

export type AdminGpsMapProps = {
  locations: AdminGpsDriverLocation[];
  selectedId: string | null;
  onSelectDriver: (driverId: string) => void;
  mapHeight?: number;
};

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, '');
}

function markerHtml(loc: AdminGpsDriverLocation, selected: boolean): string {
  const color = adminGpsMarkerColor(loc);
  const active = isAdminGpsActive(loc.updated_at);
  const size = selected ? 40 : 34;
  const border = selected ? '3px solid #1A1A2E' : '2px solid #fff';
  const emoji = adminGpsMarkerEmoji(loc);
  const pulse = active
    ? `animation:admin-gps-pulse 1.8s ease-out infinite;`
    : 'opacity:0.55;';
  const name = escapeHtml(loc.full_name?.trim() ?? '');

  return `
    <style>
      @keyframes admin-gps-pulse {
        0% { box-shadow: 0 0 0 0 ${color}88; }
        70% { box-shadow: 0 0 0 14px ${color}00; }
        100% { box-shadow: 0 0 0 0 ${color}00; }
      }
    </style>
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};border:${border};
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        font-size:16px;line-height:1;${pulse}
      ">${emoji}</div>
      ${
        name
          ? `<span style="
        margin-top:4px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        font:600 11px/1.2 system-ui,sans-serif;color:#1A1A2E;
        background:rgba(255,255,255,0.92);padding:2px 6px;border-radius:4px;
      ">${name}</span>`
          : ''
      }
    </div>
  `;
}

function popupHtml(loc: AdminGpsDriverLocation, formatAgo: (iso: string) => string): string {
  const name = escapeHtml(loc.full_name?.trim() ?? '—');
  const vehicle = escapeHtml(loc.vehicle_label ?? '—');
  const updated = escapeHtml(formatAgo(loc.updated_at));
  return `
    <div style="font:13px/1.4 system-ui,sans-serif;min-width:140px;">
      <strong style="display:block;margin-bottom:4px;color:#1A1A2E;">${name}</strong>
      <span style="color:#6B7280;">${vehicle}</span><br/>
      <span style="color:#9CA3AF;font-size:12px;">${updated}</span>
    </div>
  `;
}

export function AdminGpsMap({
  locations,
  selectedId,
  onSelectDriver,
  mapHeight,
}: AdminGpsMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<Map<string, any>>(new Map());
  const onSelectRef = useRef(onSelectDriver);
  const [mapReady, setMapReady] = useState(false);
  onSelectRef.current = onSelectDriver;

  useEffect(() => {
    const el = hostRef.current;
    if (!el || mapRef.current) return;

    let cancelled = false;
    let t1 = 0;
    let t2 = 0;

    void loadLeaflet().then((L) => {
      if (cancelled || !hostRef.current || mapRef.current) return;

      const map = L.map(el, { center: TBILISI, zoom: DEFAULT_ZOOM, zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);

      t1 = window.setTimeout(() => map.invalidateSize(), 150);
      t2 = window.setTimeout(() => map.invalidateSize(), 600);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      const map = mapRef.current;
      if (map) {
        markersRef.current.clear();
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
        setMapReady(false);
      }
    };
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    void loadLeaflet().then((L) => {
      const formatAgo = (iso: string) => {
        const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m`;
      };

      const nextIds = new Set(locations.map((l) => l.driver_id));
      for (const [id, marker] of markersRef.current) {
        if (!nextIds.has(id)) {
          layer.removeLayer(marker);
          markersRef.current.delete(id);
        }
      }

      const latLngs: [number, number][] = [];

      for (const loc of locations) {
        if (!Number.isFinite(loc.latitude) || !Number.isFinite(loc.longitude)) continue;
        const latLng: [number, number] = [loc.latitude, loc.longitude];
        latLngs.push(latLng);

        const selected = loc.driver_id === selectedId;
        const icon = L.divIcon({
          className: '',
          html: markerHtml(loc, selected),
          iconSize: [120, selected ? 68 : 58],
          iconAnchor: [60, selected ? 34 : 29],
        });

        let marker = markersRef.current.get(loc.driver_id);
        if (marker) {
          marker.setLatLng(latLng);
          marker.setIcon(icon);
          marker.setPopupContent(popupHtml(loc, formatAgo));
          marker.setZIndexOffset(selected ? 1000 : 0);
        } else {
          marker = L.marker(latLng, { icon }).addTo(layer);
          marker.bindPopup(popupHtml(loc, formatAgo), { closeButton: false, offset: [0, -8] });
          marker.on('click', () => onSelectRef.current(loc.driver_id));
          marker.on('mouseover', () => {
            marker?.openPopup();
          });
          markersRef.current.set(loc.driver_id, marker);
        }
      }

      if (selectedId) {
        const sel = locations.find((l) => l.driver_id === selectedId);
        if (sel) {
          map.setView([sel.latitude, sel.longitude], Math.max(map.getZoom(), 14), { animate: true });
          markersRef.current.get(selectedId)?.openPopup();
        }
      } else if (latLngs.length === 1) {
        map.setView(latLngs[0], Math.max(map.getZoom(), 14), { animate: true });
      } else if (latLngs.length > 1) {
        map.fitBounds(L.latLngBounds(latLngs), { padding: [48, 48], maxZoom: 15, animate: true });
      }
    });
  }, [locations, selectedId, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t1 = window.setTimeout(() => map.invalidateSize(), 100);
    const t2 = window.setTimeout(() => map.invalidateSize(), 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [mapHeight, locations.length]);

  return (
    <View style={[styles.wrap, mapHeight != null ? { height: mapHeight } : styles.wrapFlex]}>
      {createElement('div', {
        ref: (node: HTMLDivElement | null) => {
          hostRef.current = node;
        },
        style: {
          width: '100%',
          height: '100%',
          minHeight: mapHeight ?? 360,
          flex: 1,
          borderRadius: 8,
          overflow: 'hidden',
          background: '#F8F9FA',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 8,
    overflow: 'hidden',
  },
  wrapFlex: {
    flex: 1,
    minHeight: 360,
  },
});
