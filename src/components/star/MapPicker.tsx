"use client";

// Drop or drag a pin on OpenStreetMap. Leaflet is loaded in the browser only; the pin is a CSS
// dot so no marker images are needed.

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";
import type { LatLng, Map as LeafletMap, Marker } from "leaflet";

const DERBY = { lat: 52.9548, lon: -1.1581 };

export function MapPicker({ lat, lon, onPick, locateRef }: { lat: number | null; lon: number | null; onPick: (lat: number, lon: number) => void; locateRef?: React.MutableRefObject<((lat: number, lon: number) => void) | null> }) {
  const host = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    let map: LeafletMap | null = null;
    let marker: Marker | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !host.current) return;
      const start = { lat: lat ?? DERBY.lat, lon: lon ?? DERBY.lon };
      map = L.map(host.current, { zoomControl: true }).setView([start.lat, start.lon], lat != null ? 15 : 7);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      const icon = L.divIcon({ className: "", html: '<div class="star-pin"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
      const place = (la: number, lo: number, pan: boolean) => {
        if (!map) return;
        if (!marker) {
          marker = L.marker([la, lo], { draggable: true, icon }).addTo(map);
          marker.on("dragend", () => {
            const p = (marker as Marker).getLatLng() as LatLng;
            pick.current(p.lat, p.lng);
          });
        } else marker.setLatLng([la, lo]);
        if (pan) map.panTo([la, lo]);
        pick.current(la, lo);
      };
      place(start.lat, start.lon, false);
      map.on("click", (e) => place(e.latlng.lat, e.latlng.lng, true));
      if (locateRef)
        locateRef.current = (la, lo) => {
          place(la, lo, true);
          map?.setZoom(15);
        };
      // Leaflet sizes itself before the drawer finishes animating; nudge it once settled.
      setTimeout(() => map?.invalidateSize(), 250);
    })();
    return () => {
      cancelled = true;
      if (locateRef) locateRef.current = null;
      map?.remove();
    };
    // The map is created once per open; later lat/lon changes come from the map itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="star-map" />;
}
