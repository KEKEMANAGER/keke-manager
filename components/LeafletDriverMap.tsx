/** Native stub — web implementation is in LeafletDriverMap.web.tsx */
export type LeafletMapPin = {
  driver_id: string;
  latitude: number;
  longitude: number;
  updated_at: string;
  full_name: string | null;
  /** Host driver on fleet map; false = sub-driver */
  isHost?: boolean;
  /** Override marker color (hex) */
  color?: string;
};

export type LeafletDriverMapProps = {
  pins: LeafletMapPin[];
  selectedId?: string | null;
  hostDriverId?: string;
  onSelectPin?: (driverId: string) => void;
  style?: object;
};

export function LeafletDriverMap(_props: LeafletDriverMapProps) {
  return null;
}
