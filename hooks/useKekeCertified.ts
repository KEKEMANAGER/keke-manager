import { useEffect, useState } from 'react';
import { fetchCertifiedDriverIds } from '../lib/kekeCertified';

/** Whether this driver is KEKE Certified. False while loading or on any error. */
export function useKekeCertified(driverId: string | null | undefined): boolean {
  const [certified, setCertified] = useState(false);
  useEffect(() => {
    const id = driverId?.trim();
    if (!id) {
      setCertified(false);
      return;
    }
    let cancelled = false;
    void fetchCertifiedDriverIds([id]).then((ids) => {
      if (!cancelled) setCertified(ids.has(id));
    });
    return () => {
      cancelled = true;
    };
  }, [driverId]);
  return certified;
}
