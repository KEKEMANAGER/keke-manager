"use client";

import { useEffect } from "react";

/** პირველ ჩატვირთვაზე Users/Drivers სინქი Airtable-ში. */
export function DriverAuthSync() {
  useEffect(() => {
    void fetch("/api/auth/sync", { method: "POST" }).catch(() => {
      /* იგნორ — სერვერზე retry page რენდერით */
    });
  }, []);
  return null;
}
