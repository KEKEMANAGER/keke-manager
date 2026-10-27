import { createElement, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { loadLeaflet } from '../lib/loadLeaflet.web';
import { COLORS } from '../constants/theme';
import type { LeafletDriverMapProps, LeafletMapPin } from './LeafletDriverMap';

const TBILISI: [number, number] = [41.6938, 44.8015];
const DEFAULT_ZOOM = 12;
/**
 * After someone zooms or drags the map, stop re-fitting it to the drivers on
 * every location update for this long — otherwise a big-screen map snaps back
 * every few seconds and nobody can look closer at one car.
 */
const USER_MOVE_PAUSE_MS = 60_000;

function isStale(updatedAt: string, maxAgeMs = 60_000): boolean {
  return Date.now() - new Date(updatedAt).getTime() > maxAgeMs;
}

function markerColor(pin: LeafletMapPin, hostDriverId?: string): string {
  if (pin.color) return pin.color;
  if (isStale(pin.updated_at)) return COLORS.textMuted;
  const isHost = pin.isHost ?? (hostDriverId ? pin.driver_id === hostDriverId : true);
  return isHost ? COLORS.gold : COLORS.blue;
}

function markerHtml(color: string, selected: boolean, label: string): string {
  const size = selected ? 40 : 34;
  const border = selected ? '3px solid #1A1A2E' : '2px solid #fff';
  const safe = label.replace(/[<>&"]/g, '');
  return `
    <div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;">
      <div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};border:${border};
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        display:flex;align-items:center;justify-content:center;
        font-size:16px;line-height:1;
      ">🚗</div>
      <div style="
        width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;
        border-top:8px solid ${color};margin-top:-1px;
      "></div>
      ${
        safe
          ? `<span style="
        margin-top:2px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        font:600 11px/1.2 system-ui,sans-serif;color:#1A1A2E;
        background:rgba(255,255,255,0.92);padding:2px 6px;border-radius:4px;
        box-shadow:0 1px 4px rgba(0,0,0,0.12);
      ">${safe}</span>`
          : ''
      }
    </div>
  `;
}

function divIconForPin(
  L: any,
  pin: LeafletMapPin,
  selected: boolean,
  hostDriverId?: string,
) {
  const color = markerColor(pin, hostDriverId);
  const label = pin.full_name?.trim() ?? '';
  const size = selected ? 40 : 34;
  return L.divIcon({
    className: '',
    html: markerHtml(color, selected, label),
    iconSize: [120, size + 28],
    iconAnchor: [60, size + 8],
  });
}

export function LeafletDriverMap({
  pins,
  selectedId,
  hostDriverId,
  onSelectPin,
  style,
  controlsTopOffset,
}: LeafletDriverMapProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());
  const onSelectRef = useRef(onSelectPin);
  const lastUserMoveRef = useRef(0);
  const prevSelectedRef = useRef<string | null | undefined>(undefined);
  const [mapReady, setMapReady] = useState(false);
  onSelectRef.current = onSelectPin;

  useEffect(() => {
    const markers = markersRef.current;
    const el = hostRef.current;
    if (!el || mapRef.current) return;

    let cancelled = false;
    let sizeTimer = 0;
    let resizeObserver: ResizeObserver | null = null;

    const markUserMove = () => {
      lastUserMoveRef.current = Date.now();
    };
    el.addEventListener('wheel', markUserMove, { passive: true });
    el.addEventListener('mousedown', markUserMove);
    el.addEventListener('touchstart', markUserMove, { passive: true });
    el.addEventListener('keydown', markUserMove);

    void loadLeaflet().then((L) => {
      if (cancelled || !hostRef.current || mapRef.current) return;

      const map = L.map(el, {
        center: TBILISI,
        zoom: DEFAULT_ZOOM,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setMapReady(true);

      sizeTimer = window.setTimeout(() => map.invalidateSize(), 150);

      // The box can change size after the map is drawn — full screen, a
      // rotated phone, a resized window — and Leaflet leaves grey gaps
      // until it is told.
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          try {
            map.invalidateSize();
          } catch {
            // The map is being torn down.
          }
        });
        resizeObserver.observe(el);
      }
    });

    return () => {
      cancelled = true;
      window.clearTimeout(sizeTimer);
      resizeObserver?.disconnect();
      el.removeEventListener('wheel', markUserMove);
      el.removeEventListener('mousedown', markUserMove);
      el.removeEventListener('touchstart', markUserMove);
      el.removeEventListener('keydown', markUserMove);
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
    const container = mapRef.current?.zoomControl?.getContainer?.() as HTMLElement | undefined;
    if (container) container.style.marginTop = controlsTopOffset ? `${controlsTopOffset}px` : '';
  }, [mapReady, controlsTopOffset]);

  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    void loadLeaflet().then((L) => {
      const nextIds = new Set(pins.map((p) => p.driver_id));
      for (const [id, marker] of markersRef.current) {
        if (!nextIds.has(id)) {
          layer.removeLayer(marker);
          markersRef.current.delete(id);
        }
      }

      const latLngs: [number, number][] = [];

      for (const pin of pins) {
        if (!Number.isFinite(pin.latitude) || !Number.isFinite(pin.longitude)) continue;
        const latLng: [number, number] = [pin.latitude, pin.longitude];
        latLngs.push(latLng);

        const selected = pin.driver_id === selectedId;
        const icon = divIconForPin(L, pin, selected, hostDriverId);
        let marker = markersRef.current.get(pin.driver_id);

        if (marker) {
          marker.setLatLng(latLng);
          marker.setIcon(icon);
          marker.setZIndexOffset(selected ? 1000 : 0);
        } else {
          marker = L.marker(latLng, { icon }).addTo(layer);
          marker.on('click', () => onSelectRef.current?.(pin.driver_id));
          markersRef.current.set(pin.driver_id, marker);
        }
      }

      const selectionChanged = prevSelectedRef.current !== selectedId;
      prevSelectedRef.current = selectedId;
      const userIsLooking = Date.now() - lastUserMoveRef.current < USER_MOVE_PAUSE_MS;

      if (!userIsLooking) {
        if (latLngs.length === 1) {
          map.setView(latLngs[0], Math.max(map.getZoom(), 14), { animate: true });
        } else if (latLngs.length > 1) {
          const bounds = L.latLngBounds(latLngs);
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 15, animate: true });
        }
      }

      // Picking a driver always brings them into view; otherwise the view
      // stays where the person put it.
      if (selectedId && (selectionChanged || !userIsLooking)) {
        const sel = pins.find((p) => p.driver_id === selectedId);
        if (sel) {
          map.panTo([sel.latitude, sel.longitude], { animate: true });
        }
      }
    });
  }, [pins, selectedId, hostDriverId, mapReady]);

  return (
    <View style={[styles.wrap, style]}>
      {createElement('div', {
        ref: (node: HTMLDivElement | null) => {
          hostRef.current = node;
        },
        style: {
          width: '100%',
          height: '100%',
          minHeight: 360,
          flex: 1,
          borderRadius: 8,
          overflow: 'hidden',
        },
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignSelf: 'stretch',
    minHeight: 360,
    width: '100%',
  },
});
