"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import "leaflet/dist/leaflet.css";

// We dynamically import react-leaflet components to completely avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then(mod => mod.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(mod => mod.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(mod => mod.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(mod => mod.Popup), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then(mod => mod.Circle), { ssr: false });

interface MapComponentProps {
  userLat: number;
  userLng: number;
  officeLat: number;
  officeLng: number;
  radiusMeters: number;
}

export default function MapComponent({
  userLat,
  userLng,
  officeLat,
  officeLng,
  radiusMeters,
}: MapComponentProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Dynamically import leaflet and setup icons on client only,
    // then render the map once icons are configured
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
      });
      setMounted(true);
    });
  }, []);

  if (!mounted) return null;

  const center: [number, number] = [officeLat, officeLng];
  const userPosition: [number, number] = [userLat, userLng];

  return (
    <div className="h-[300px] w-full rounded-md overflow-hidden relative z-0">
      <MapContainer
        center={center}
        zoom={16}
        scrollWheelZoom={true}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* Office Location & Geofence */}
        <Marker position={center}>
          <Popup>مقر الشركة (Office)</Popup>
        </Marker>
        <Circle
          center={center}
          pathOptions={{ color: "green", fillColor: "green", fillOpacity: 0.2 }}
          radius={radiusMeters}
        />
        
        {/* User Location */}
        <Marker position={userPosition}>
          <Popup>موقعك الحالي (You)</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
