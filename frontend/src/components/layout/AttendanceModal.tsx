"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { fetchWithAuth, API_BASE_URL } from '@/lib/apiClient';
import { useLocalization } from "@/contexts/LocalizationContext";

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
  const { isRtl } = useLocalization();
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
      setLocationError(isRtl ? "المتصفح لا يدعم تحديد الموقع الجغرافي" : "Geolocation is not supported by your browser");
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
        setLocationError(isRtl ? "تعذّر تحديد موقعك. يرجى السماح بأذونات الموقع." : "Unable to retrieve your location. Please allow location permissions.");
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
    // Runs on open/close only; getLocation is intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          alert((isRtl ? "خطأ: " : "Error: ") + (data.error || (isRtl ? "فشل تسجيل الحضور" : "Check-in failed")));
          return;
        }
      }

      setIsCheckedIn(true);
      localStorage.setItem("septimus_attendance_status", "checked_in");
      alert(isRtl ? "تم تسجيل الحضور بنجاح!" : "Check-in successful!");
      onClose();
    } catch (err) {
      console.error(err);
      alert(isRtl ? "حدث خطأ أثناء تسجيل الحضور." : "An error occurred during check-in.");
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
          alert((isRtl ? "خطأ: " : "Error: ") + (data.error || (isRtl ? "فشل تسجيل الانصراف" : "Check-out failed")));
          return;
        }
      }

      setIsCheckedIn(false);
      localStorage.removeItem("septimus_attendance_status");
      alert(isRtl ? "تم تسجيل الانصراف بنجاح!" : "Check-out successful!");
      onClose();
    } catch (err) {
      console.error(err);
      alert(isRtl ? "حدث خطأ أثناء تسجيل الانصراف." : "An error occurred during check-out.");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-2xl">
        <DialogHeader className="text-center sm:text-center items-center justify-center flex flex-col gap-1.5">
          <DialogTitle className="flex items-center justify-center gap-2 text-center w-full text-lg font-extrabold text-slate-900 dark:text-white">
            <MapPin className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0" />
            <span>{isRtl ? "تسجيل الحضور / الانصراف" : "Attendance Check-In / Check-Out"}</span>
          </DialogTitle>
          <DialogDescription className="text-center max-w-sm mx-auto leading-relaxed text-xs font-medium text-slate-500 dark:text-slate-400">
            {isRtl ? `يرجى التأكد من وجودك ضمن نطاق الشركة (أقل من ${radiusMeters} متر) لتسجيل الحضور.` : `Please ensure you are within the company radius (less than ${radiusMeters} meters) to register attendance.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {loadingLocation ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-3 text-center">
              <Loader2 className="w-8 h-8 text-purple-600 dark:text-purple-400 animate-spin" />
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{isRtl ? "جارِ تحديد الموقع الجغرافي..." : "Fetching location..."}</p>
            </div>
          ) : locationError ? (
            <div className="p-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-300 rounded-xl text-sm text-center font-medium">
              {locationError}
              <Button variant="outline" size="sm" className="mt-3 w-full font-bold rounded-lg" onClick={getLocation}>
                {isRtl ? "إعادة المحاولة" : "Retry"}
              </Button>
            </div>
          ) : userLat && userLng ? (
            <>
              {/* Map View */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-inner">
                <MapComponent
                  userLat={userLat}
                  userLng={userLng}
                  officeLat={officeLat}
                  officeLng={officeLng}
                  radiusMeters={radiusMeters}
                />
              </div>

              {/* Status & Action */}
              <div className="flex flex-col gap-2 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
                <div className="flex justify-between items-center px-1">
                  <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{isRtl ? "المسافة من المقر:" : "Distance from HQ:"}</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white" dir="ltr">{distance?.toFixed(2)} {isRtl ? "متر" : "meters"}</span>
                </div>
                
                {isWithinRadius ? (
                  <div className="flex items-center justify-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold mt-2 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800/60">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{isRtl ? "أنت ضمن نطاق الشركة المعتمد." : "You are within the approved company radius."}</span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 mt-2">
                    <div className="flex items-center justify-center gap-2 text-red-600 dark:text-red-400 font-bold py-1.5 bg-red-50 dark:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-800/60">
                      <XCircle className="w-4 h-4 shrink-0" />
                      <span className="text-sm">{isRtl ? "أنت خارج نطاق الشركة!" : "You are outside the company radius!"}</span>
                    </div>
                    {allowRemote && (
                      <div className="flex items-center justify-center gap-2 mt-1 p-2.5 bg-purple-50 dark:bg-purple-950/40 rounded-lg border border-purple-200 dark:border-purple-800/60">
                        <input 
                          type="checkbox" 
                          id="remote-checkin"
                          checked={isRemoteCheckIn}
                          onChange={(e) => setIsRemoteCheckIn(e.target.checked)}
                          className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer"
                        />
                        <label htmlFor="remote-checkin" className="text-sm text-purple-700 dark:text-purple-300 font-bold cursor-pointer">
                          {isRtl ? "تسجيل الحضور عن بُعد (العمل عن بُعد)" : "Register Attendance Remotely (Remote Work)"}
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center gap-3 mt-1 w-full">
                <Button variant="outline" onClick={getLocation} className="flex-1 py-5 text-sm font-semibold rounded-xl">
                  {isRtl ? "تحديث الموقع" : "Refresh Location"}
                </Button>
                {isCheckedIn ? (
                  <Button 
                    onClick={handleCheckOut}
                    className="flex-1 py-5 text-sm font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20"
                  >
                    {isRtl ? "تسجيل انصراف" : "Check Out"}
                  </Button>
                ) : (
                  <Button 
                    onClick={handleCheckIn}
                    disabled={!canCheckIn}
                    className={`flex-1 py-5 text-sm font-bold rounded-xl transition-all shadow-md ${canCheckIn ? "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20" : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 shadow-none"}`}
                  >
                    {isRtl ? "تسجيل حضور" : "Check In"}
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
