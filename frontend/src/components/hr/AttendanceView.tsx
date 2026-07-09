"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin, Clock, CheckCircle, XCircle, LogIn, LogOut,
  Wifi, WifiOff, Users, AlertTriangle, RefreshCw
} from "lucide-react";
import { fetchWithAuth, API_BASE_URL } from "@/lib/apiClient";
import { useLocalization } from "@/contexts/LocalizationContext";

interface AttendanceRecord {
  id: string;
  employee_name: string;
  date: string;
  check_in?: string;
  check_out?: string;
  location_verified: boolean;
  lat?: number;
  lng?: number;
  distance_meters?: number;
  status: "present" | "late" | "absent" | "checked_out";
}

// Office coordinates — configurable
const OFFICE_LAT = 24.7136; // Riyadh default
const OFFICE_LNG = 46.6753;
const GEOFENCE_RADIUS_M = 200; // 200 meters radius

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Western digits in both languages; Arabic month/weekday names when RTL
function localeFor(isRtl: boolean): string {
  return isRtl ? "ar-SA-u-nu-latn" : "en-SA";
}

function formatTime(iso: string | undefined, isRtl: boolean): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(localeFor(isRtl), { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string, isRtl: boolean): string {
  return new Date(iso).toLocaleDateString(localeFor(isRtl), { weekday: "short", year: "numeric", month: "short", day: "numeric" });
}

type GeoStatus = "idle" | "locating" | "inside" | "outside" | "error";

export default function AttendanceView() {
  const { t, isRtl } = useLocalization();
  const today = new Date().toISOString().split("T")[0];
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState("");
  const [filterDate, setFilterDate] = useState(today);

  const currentTime = new Date().toLocaleTimeString(isRtl ? "ar-SA-u-nu-latn" : "en-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const workspaceId = typeof window !== "undefined"
    ? (localStorage.getItem("currentWorkspaceId") || "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e")
    : "797ec9d1-e70e-4ca7-a9aa-2d4fed3d879e";

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/entities?workspace_id=${workspaceId}&type=hr_attendance&limit=50`);
      if (!res.ok) throw new Error("Failed");
      const json = await res.json();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: AttendanceRecord[] = (json.data || []).map((e: any) => ({
        id: e.id || e.ID,
        employee_name: e.data?.employee_name || t("hr.unknownEmployee"),
        date: e.data?.date || today,
        check_in: e.data?.check_in,
        check_out: e.data?.check_out,
        location_verified: e.data?.location_verified ?? false,
        lat: e.data?.lat,
        lng: e.data?.lng,
        distance_meters: e.data?.distance_meters,
        status: e.data?.status || "absent",
      }));
      setRecords(data.sort((a, b) => b.date.localeCompare(a.date)));
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
    // `t` is a stable fallback label here; excluded to avoid refetching on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, today]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecords();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchRecords]);

  const locateUser = () => {
    setGeoStatus("locating");
    setErrorMsg(null);
    if (!navigator.geolocation) {
      setGeoStatus("error");
      setErrorMsg(t("hr.geoUnsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const dist = haversineDistance(latitude, longitude, OFFICE_LAT, OFFICE_LNG);
        setUserLat(latitude);
        setUserLng(longitude);
        setDistanceM(Math.round(dist));
        setGeoStatus(dist <= GEOFENCE_RADIUS_M ? "inside" : "outside");
      },
      (err) => {
        setGeoStatus("error");
        setErrorMsg(`${t("hr.locationErrorPrefix")}${err.message}`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  const handleCheckIn = async () => {
    if (!employeeName.trim()) { setErrorMsg(t("hr.enterNameFirst")); return; }
    if (geoStatus !== "inside" && geoStatus !== "outside") { setErrorMsg(t("hr.verifyLocationFirst")); return; }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const now = new Date().toISOString();
    const checkInHour = new Date().getHours();
    const isLate = checkInHour >= 9; // Late if after 9AM

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/entities?workspace_id=${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({
          entity_type: "hr_attendance",
          name: `Attendance-${employeeName}-${today}`,
          data: {
            employee_name: employeeName,
            date: today,
            check_in: now,
            location_verified: geoStatus === "inside",
            lat: userLat,
            lng: userLng,
            distance_meters: distanceM,
            status: geoStatus === "inside" ? (isLate ? "late" : "present") : "present",
            geofence_radius_m: GEOFENCE_RADIUS_M,
            office_lat: OFFICE_LAT,
            office_lng: OFFICE_LNG,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to record check-in");
      setSuccessMsg(`✅ ${t("hr.checkInSuccess")} ${employeeName} ${t("hr.atTime")} ${formatTime(now, isRtl)} ${geoStatus === "inside" ? `📍 (${t("hr.insideGeofence")})` : `⚠️ (${t("hr.outsideGeofence")})`}`);
      fetchRecords();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t("hr.recordFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleCheckOut = async (record: AttendanceRecord) => {
    setSaving(true);
    setErrorMsg(null);
    const now = new Date().toISOString();
    const checkInTime = record.check_in ? new Date(record.check_in) : null;
    const checkOutTime = new Date(now);
    const hoursWorked = checkInTime
      ? Math.round(((checkOutTime.getTime() - checkInTime.getTime()) / 3600000) * 10) / 10
      : 0;

    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/entities/${record.id}?workspace_id=${workspaceId}`, {
        method: "PUT",
        body: JSON.stringify({
          data: {
            ...record,
            check_out: now,
            hours_worked: hoursWorked,
            status: "checked_out",
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to record check-out");
      setSuccessMsg(`✅ ${t("hr.checkOutSuccess")} ${record.employee_name} — ${t("hr.worked")} ${hoursWorked} ${t("hr.hours")}`);
      fetchRecords();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : t("hr.recordFailed"));
    } finally {
      setSaving(false);
    }
  };

  const todayRecords = records.filter(r => r.date === filterDate);
  const presentCount = todayRecords.filter(r => r.status === "present" || r.status === "checked_out" || r.status === "late").length;
  const lateCount = todayRecords.filter(r => r.status === "late").length;

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] w-full overflow-hidden">

      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-slate-200 bg-white">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-6 h-6 text-indigo-600" />
              {t("hr.gpsAttendance")}
            </h1>
            <p className="text-slate-500 mt-1 text-sm">{t("hr.gpsAttendanceDesc")}</p>
          </div>
          <div className="text-end">
            <div className="flex items-center gap-2 text-slate-700 font-mono text-xl font-bold">
              <Clock className="w-5 h-5 text-indigo-500" />
              {currentTime}
            </div>
            <p className="text-xs text-slate-400 mt-1">{formatDate(today, isRtl)}</p>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-3 gap-4 mt-5">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-emerald-600 bg-emerald-100 rounded-lg p-1.5" />
            <div>
              <p className="text-xs text-slate-500 font-medium">{t("hr.presentToday")}</p>
              <p className="text-2xl font-black text-emerald-700">{presentCount}</p>
            </div>
          </div>
          <div className={`border rounded-xl p-3 flex items-center gap-3 ${lateCount > 0 ? "bg-amber-50 border-amber-200" : "bg-slate-50 border-slate-200"}`}>
            <AlertTriangle className={`w-8 h-8 rounded-lg p-1.5 ${lateCount > 0 ? "text-amber-700 bg-amber-100" : "text-slate-400 bg-slate-100"}`} />
            <div>
              <p className="text-xs text-slate-500 font-medium">{t("hr.lateEmployees")}</p>
              <p className={`text-2xl font-black ${lateCount > 0 ? "text-amber-700" : "text-slate-800"}`}>{lateCount}</p>
            </div>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
            <Users className="w-8 h-8 text-slate-500 bg-slate-100 rounded-lg p-1.5" />
            <div>
              <p className="text-xs text-slate-500 font-medium">{t("hr.totalRecords")}</p>
              <p className="text-2xl font-black text-slate-800">{todayRecords.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-5 gap-6">

        {/* Check-in Panel */}
        <div className="lg:col-span-2 space-y-4">

          {/* Geo Verifier Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-indigo-600" />
              {t("hr.verifyLocation")}
            </h3>

            <div className={`rounded-xl p-4 mb-4 text-center border-2 transition-all ${
              geoStatus === "inside" ? "bg-emerald-50 border-emerald-400" :
              geoStatus === "outside" ? "bg-amber-50 border-amber-400" :
              geoStatus === "locating" ? "bg-blue-50 border-blue-300 animate-pulse" :
              geoStatus === "error" ? "bg-rose-50 border-rose-300" :
              "bg-slate-50 border-slate-200"
            }`}>
              {geoStatus === "idle" && <><WifiOff className="w-10 h-10 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">{t("hr.clickToLocate")}</p></>}
              {geoStatus === "locating" && <><Wifi className="w-10 h-10 text-blue-400 mx-auto mb-2 animate-pulse" /><p className="text-sm text-blue-600 font-semibold">{t("hr.locating")}</p></>}
              {geoStatus === "inside" && (
                <>
                  <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-emerald-700">✅ {t("hr.insideGeofence")}</p>
                  <p className="text-xs text-emerald-600 mt-1">{t("hr.distance")} {distanceM}{t("hr.meters")}</p>
                </>
              )}
              {geoStatus === "outside" && (
                <>
                  <AlertTriangle className="w-10 h-10 text-amber-600 mx-auto mb-2" />
                  <p className="text-sm font-bold text-amber-700">⚠️ {t("hr.outsideGeofence")}</p>
                  <p className="text-xs text-amber-600 mt-1">{t("hr.distance")} {distanceM}m — {t("hr.allowedRadius")} {GEOFENCE_RADIUS_M}م</p>
                  <p className="text-xs text-slate-500 mt-1">{t("hr.canRegisterButOutside")}</p>
                </>
              )}
              {geoStatus === "error" && <><XCircle className="w-10 h-10 text-rose-500 mx-auto mb-2" /><p className="text-xs text-rose-600">{errorMsg}</p></>}
            </div>

            <button
              type="button"
              onClick={locateUser}
              disabled={geoStatus === "locating"}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              <MapPin className="w-4 h-4" />
              {geoStatus === "locating" ? t("hr.locating") : `📍 ${t("hr.locateMe")}`}
            </button>
          </div>

          {/* Check-in Form */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
              <LogIn className="w-4 h-4 text-emerald-600" />
              {t("hr.checkIn")}
            </h3>

            {successMsg && (
              <div className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 font-medium">{successMsg}</div>
            )}
            {errorMsg && geoStatus !== "error" && (
              <div className="mb-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{errorMsg}</div>
            )}

            <div className="space-y-3">
              <div>
                <label htmlFor="emp_name" className="block text-xs font-semibold text-slate-500 uppercase mb-1">{t("hr.employeeName")} *</label>
                <input
                  id="emp_name"
                  type="text"
                  value={employeeName}
                  onChange={e => setEmployeeName(e.target.value)}
                  placeholder={t("hr.enterFullName")}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:border-indigo-500 outline-none"
                />
              </div>

              <button
                type="button"
                onClick={handleCheckIn}
                disabled={saving || !employeeName.trim() || geoStatus === "idle" || geoStatus === "locating"}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                {saving ? t("common.loading") : `✅ ${t("hr.checkIn")}`}
              </button>
            </div>
          </div>
        </div>

        {/* Attendance Log */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700">{t("hr.attendanceLog")}</h3>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={filterDate}
                  aria-label={t("hr.logsDate")}
                  title={t("hr.logsDate")}
                  onChange={e => setFilterDate(e.target.value)}
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700 focus:border-indigo-400 outline-none"
                />
                <button
                  type="button"
                  onClick={fetchRecords}
                  className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                  title={t("common.refresh")}
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-center text-slate-400 text-sm">{t("common.loading")}</div>
            ) : todayRecords.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                <p className="text-slate-400 text-sm">{t("hr.noAttendanceRecords")}</p>
                <p className="text-slate-300 text-xs mt-1">{t("hr.startCheckIn")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {todayRecords.map((record) => (
                  <div key={record.id} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-sm font-bold text-indigo-700">
                        {record.employee_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800">{record.employee_name}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <LogIn className="w-3 h-3 text-emerald-500" />
                            {formatTime(record.check_in, isRtl)}
                          </span>
                          {record.check_out && (
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                              <LogOut className="w-3 h-3 text-rose-400" />
                              {formatTime(record.check_out, isRtl)}
                            </span>
                          )}
                          <span className={`text-xs flex items-center gap-1 ${record.location_verified ? "text-emerald-600" : "text-amber-600"}`}>
                            <MapPin className="w-3 h-3" />
                            {record.distance_meters !== undefined ? `${record.distance_meters}m` : "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Status Badge */}
                      {record.status === "present" && <span className="px-2 py-1 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">✅ {t("common.present")}</span>}
                      {record.status === "late" && <span className="px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-700">⏰ {t("hr.late")}</span>}
                      {record.status === "checked_out" && <span className="px-2 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-600">✓ {t("hr.checkedOut")}</span>}

                      {/* Checkout Button */}
                      {!record.check_out && (
                        <button
                          type="button"
                          onClick={() => handleCheckOut(record)}
                          disabled={saving}
                          className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 rounded-xl transition-colors flex items-center gap-1 disabled:opacity-50"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          {t("hr.checkOut")}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
