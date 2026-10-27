import type { ReactNode } from 'react';
import type { LeafletMapPin } from '../LeafletDriverMap';

/**
 * Native stub. The phone app already shows these maps full screen; the
 * website's version is in FullScreenDriverMap.web.tsx.
 */

export type FullScreenDriverRow = {
  id: string;
  name: string;
  /** e.g. "Host" / "Sub-driver". */
  tag?: string | null;
  route?: string | null;
  phone?: string | null;
  /** Last location time; null = no signal. */
  updatedAt?: string | null;
  dotColor: string;
};

export type FullScreenDriverMapProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string | null;
  pins: LeafletMapPin[];
  selectedId: string | null;
  hostDriverId?: string;
  onSelect: (driverId: string) => void;
  rows: FullScreenDriverRow[];
  /** The live / weak signal badge the screen already shows. */
  badge?: ReactNode;
};

export function FullScreenDriverMap(_props: FullScreenDriverMapProps) {
  return null;
}

export function FullScreenMapButton(_props: { onPress: () => void }) {
  return null;
}

export function useFullScreenMap(): { open: boolean; openMap: () => void; closeMap: () => void } {
  return { open: false, openMap: () => undefined, closeMap: () => undefined };
}
