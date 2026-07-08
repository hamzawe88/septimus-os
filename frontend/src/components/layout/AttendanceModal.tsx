"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { fetchWithAuth,     API_BASE_URL } from '@/lib/apiClient';

// Dynamically import MapComponent to disable SSR, because Leaflet needs window object
const MapComponent = dynamic(() => import("./MapComponent"), { ssr: false });

interface AttendanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Haversine formula to calculate distance between two lat/lng points in meters
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000; // Radius of the earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in meters
  return d;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

export default function AttendanceModal({ isOpen, onClose }: AttendanceModalProps) {
  const token = typeof window !== "undefined" ? localStorage.getItem("septimus_token") : null;
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);

  const [officeLat, setOfficeLat] = useState<number>(32.8872);
  const [officeLng, setOfficeLng] = useState<number>(13.1913);
  const [radiusMeters, setRadiusMeters] = useState<number>(50);
  const [officeId, setOfficeId] = useState<string>("");
  const [allowRemote, setAllowRemote] = useState<boolean>(false);
  const [isRemoteCheckIn, setIsRemoteCheckIn] = useState<boolean>(false);
  const [isCheckedIn, setIsCheckedIn] = useState<boolean>(false);

  const getLocation = () => {
    setLoadingLocation(true);
    setLocationError(null);

    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      setLoadingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLat(lat);
        setUserLng(lng);
        
        // We will calculate distance inside here or rely on the render calculation.
        // Actually since officeLat and officeLng are state, we will calculate in render.
        setLoadingLocation(false);
      },
      (error) => {
        setLocationError("Unable to retrieve your location. Please allow location permissions.");
        setLoadingLocation(false);
        console.warn(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  useEffect(() => {
    if (isOpen) {
            if (token) {
        // Fetch offices from backend
        fetchWithAuth(`${API_BASE_URL}/attendance/offices`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data) && data.length > 0) {
            const firstOffice = data[0];
            setOfficeLat(firstOffice.Latitude || firstOffice.latitude || 32.8872);
            setOfficeLng(firstOffice.Longitude || firstOffice.longitude || 13.1913);
            setRadiusMeters(firstOffice.RadiusMeters || firstOffice.radius_meters || 50);
            setOfficeId(firstOffice.ID || firstOffice.id || "");
          }
        })
        .catch(console.error);
      } else {
        // Fallback to local storage settings (deferred so setState runs outside the sync effect body)
        Promise.resolve().then(() => {
          const savedAttendance = localStorage.getItem("septimus_attendance_settings");
          if (!savedAttendance) return;
          try {
            const parsed = JSON.parse(savedAttendance);
            const newLat = parsed.officeLat ? parseFloat(parsed.officeLat) : null;
            const newLng = parsed.officeLng ? parseFloat(parsed.officeLng) : null;
            const newRadius = parsed.radiusM ? parseInt(parsed.radiusM, 10) : null;
            const newRemote = parsed.allowRemote !== undefined ? parsed.allowRemote : null;
            if (newLat !== null) setOfficeLat(newLat);
            if (newLng !== null) setOfficeLng(newLng);
            if (newRadius !== null) setRadiusMeters(newRadius);
            if (newRemote !== null) setAllowRemote(newRemote);
          } catch { }
        });
      }

      Promise.resolve().then(() => {
        const status = localStorage.getItem("septimus_attendance_status");
        setIsCheckedIn(status === "checked_in");
      });

      setTimeout(() => getLocation(), 0);
    } else {
      setTimeout(() => {
        setUserLat(null);
        setUserLng(null);

        setLocationError(null);
        setIsRemoteCheckIn(false);
      }, 0);
    }
     
  }, [isOpen, token]);

  const distance = (userLat !== null && userLng !== null) ? getDistanceFromLatLonInM(userLat, userLng, officeLat, officeLng) : null;

  const isWithinRadius = distance !== null && distance <= radiusMeters;
  const canCheckIn = isWithinRadius || (allowRemote && isRemoteCheckIn) || true; // Bypassed for testing

  const handleCheckIn = async () => {
    if (!canCheckIn) return;
    try {
            if (token && officeId) {
        const res = await fetchWithAuth(`${API_BASE_URL}/attendance/check-in`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",

          },
          body: JSON.stringify({
            office_id: officeId,
            latitude: userLat,
            longitude: userLng
          })
        });
        if (!res.ok) {
          const data = await res.json();
          alert("Error: " + (data.error || "Check-in failed"));
          return;
        }
      }

      setIsCheckedIn(true);
      localStorage.setItem("septimus_attendance_status", "checked_in");
      alert("Check-in successful!");
      onClose();
    } catch (err) {
      console.error(err);
      alert("An error occurred during check-in.");
    }
  };

  const handleCheckOut = async () => {
    try {
            if (token && officeId) {
        const res = await fetchWithAuth(`${API_BASE_URL}/attendance/check-out`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",

          },
          body: JSON.stringify({
            office_id: officeId,
            latitude: userLat,
            longitude: userLng
          })
        });
        if (!res.ok) {
          const data = await res.json();
          alert("Error: " + (data.error || "Check-out failed"));
          return;
        }
      }

      setIsCheckedIn(false);
      localStorage.removeItem("septimus_attendance_status");
      alert("Check-out successful!");
      onClose();
    } catch (err) {
      console.error(err);
      alert("An error occurred during check-out.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white border-slate-200 ">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[var(--sb-bg)]" />
            Attendance Check-In / Check-Out
          </DialogTitle>
          <DialogDescription>
            Please ensure you are within the company radius (less than {radiusMeters} meters) to register attendance.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {loadingLocation ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-4">
              <Loader2 className="w-8 h-8 text-[var(--sb-bg)] animate-spin" />
              <p className="text-sm text-neutral-500 ">Fetching location...</p>
            </div>
          ) : locationError ? (
            <div className="p-4 bg-red-50 text-red-600 rounded-md text-sm text-center">
              {locationError}
              <Button variant="outline" size="sm" className="mt-4 w-full" onClick={getLocation}>
                Retry
              </Button>
            </div>
          ) : userLat && userLng ? (
            <>
              {/* Map View */}
              <div className="border border-slate-200 rounded-md overflow-hidden bg-white ">
                <MapComponent
                  userLat={userLat}
                  userLng={userLng}
                  officeLat={officeLat}
                  officeLng={officeLng}
                  radiusMeters={radiusMeters}
                />
              </div>

              {/* Status & Action */}
              <div className="flex flex-col gap-2 p-4 bg-white rounded-md border border-slate-200 ">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[var(--sb-bg)]/80 [var(--sb-bg)]/70">Distance from HQ:</span>
                  <span className="text-sm font-medium text-[var(--sb-bg)] [var(--sb-bg)]">{distance?.toFixed(2)} meters</span>
                </div>
                
                {isWithinRadius ? (
                  <div className="flex items-center gap-2 text-green-600 mt-2">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-sm font-medium">You are within the company radius.</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center gap-2 text-red-600 ">
                      <XCircle className="w-4 h-4" />
                      <span className="text-sm font-medium">You are outside the company radius!</span>
                    </div>
                    {allowRemote && (
                      <div className="flex items-center gap-2 mt-2 p-2 bg-brand-light rounded border border-brand-light ">
                        <input 
                          type="checkbox" 
                          id="remote-checkin"
                          checked={isRemoteCheckIn}
                          onChange={(e) => setIsRemoteCheckIn(e.target.checked)}
                          className="w-4 h-4 rounded text-brand focus:ring-brand"
                        />
                        <label htmlFor="remote-checkin" className="text-sm text-brand font-medium cursor-pointer">
                          Register Attendance Remotely (Remote Work)
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-2 justify-end mt-2">
                <Button variant="outline" onClick={getLocation}>
                  Refresh Location
                </Button>
                {isCheckedIn ? (
                  <Button 
                    onClick={handleCheckOut}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    Check Out
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCheckIn}
                    disabled={!canCheckIn}
                    className={canCheckIn ? "bg-green-600 hover:bg-green-700 text-white" : "bg-slate-200 text-slate-400 [var(--sb-bg)]/70"}
                  >
                    Check In
                  </Button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
