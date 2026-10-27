import { createElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { loadLeaflet } from '../../lib/loadLeaflet.web';
import {
  adminGpsMarkerColor,
  adminGpsMarkerEmoji,
  adminGpsTelHref,
  formatAdminGpsAgo,
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

/** The marker box: the dot, then the name and phone label under it. */
const MARKER_W = 160;
function markerDotSize(selected: boolean): number {
  return selected ? 40 : 34;
}
function markerBoxHeight(loc: AdminGpsDriverLocation, selected: boolean): number {
  const lines = (loc.full_name?.trim() ? 1 : 0) + (adminGpsTelHref(loc.phone) ? 1 : 0);
  return markerDotSize(selected) + (lines ? 4 + 4 + lines * 14 : 0);
}

function markerHtml(loc: AdminGpsDriverLocation, selected: boolean): string {
  const color = adminGpsMarkerColor(loc);
  const active = isAdminGpsActive(loc.updated_at);
  const size = markerDotSize(selected);
  const border = selected ? '3px solid #1A1A2E' : '2px solid #fff';
  const emoji = adminGpsMarkerEmoji(loc);
  const pulse = active
    ? `animation:admin-gps-pulse 1.8s ease-out infinite;`
    : 'opacity:0.55;';
  const name = escapeHtml(loc.full_name?.trim() ?? '');
  // The number sits right under the name, so the admin can call without
  // opening anything first.
  const tel = adminGpsTelHref(loc.phone);
  const phone = escapeHtml(loc.phone?.trim() ?? '');
  const phoneLine = tel
    ? `<a href="${escapeHtml(tel)}" style="
        display:block;margin-top:1px;white-space:nowrap;text-decoration:none;
        font:700 11px/1.25 system-ui,sans-serif;color:#B8860B;
      ">📞 ${phone}</a>`
    : '';
  const label =
    name || phoneLine
      ? `<div style="
        margin-top:4px;max-width:${MARKER_W}px;text-align:center;
        background:rgba(255,255,255,0.94);padding:2px 6px;border-radius:4px;
        box-shadow:0 1px 3px rgba(0,0,0,0.15);
      ">${
        name
          ? `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 11px/1.25 system-ui,sans-serif;color:#1A1A2E;">${name}</div>`
          : ''
      }${phoneLine}</div>`
      : '';

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
      ${label}
    </div>
  `;
}

function popupHtml(loc: AdminGpsDriverLocation, formatAgo: (iso: string) => string): string {
  const name = escapeHtml(loc.full_name?.trim() ?? '—');
  const vehicle = escapeHtml(loc.vehicle_label ?? '—');
  const updated = escapeHtml(formatAgo(loc.updated_at));
  const tel = adminGpsTelHref(loc.phone);
  const phone = escapeHtml(loc.phone?.trim() ?? '');
  const phoneLine = tel
    ? `<a href="${escapeHtml(tel)}" style="display:inline-block;margin:2px 0 4px;color:#B8860B;font-weight:700;text-decoration:none;">📞 ${phone}</a><br/>`
    : '';
  return `
    <div style="font:13px/1.4 system-ui,sans-serif;min-width:140px;">
      <strong style="display:block;margin-bottom:4px;color:#1A1A2E;">${name}</strong>
      ${phoneLine}
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
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const onSelectRef = useRef(onSelectDriver);
  const [mapReady, setMapReady] = useState(false);
  onSelectRef.current = onSelectDriver;

  useEffect(() => {
    const markers = markersRef.current;
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
        markers.clear();
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
      const formatAgo = (iso: string) => formatAdminGpsAgo(iso);

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
        // A live driver's label is never hidden under a stale grey pin.
        const zIndexOffset = selected ? 2000 : isAdminGpsActive(loc.updated_at) ? 1000 : 0;
        const icon = L.divIcon({
          className: '',
          html: markerHtml(loc, selected),
          iconSize: [MARKER_W, markerBoxHeight(loc, selected)],
          // The dot's centre is the driver's position; the label hangs below.
          iconAnchor: [MARKER_W / 2, markerDotSize(selected) / 2],
          popupAnchor: [0, -markerDotSize(selected) / 2],
        });

        let marker = markersRef.current.get(loc.driver_id);
        if (marker) {
          marker.setLatLng(latLng);
          marker.setIcon(icon);
          marker.setPopupContent(popupHtml(loc, formatAgo));
          marker.setZIndexOffset(zIndexOffset);
        } else {
          marker = L.marker(latLng, { icon, zIndexOffset }).addTo(layer);
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
