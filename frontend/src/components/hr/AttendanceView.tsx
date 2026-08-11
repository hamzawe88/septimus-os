"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin, Clock, CheckCircle, XCircle, LogIn, LogOut,
  Wifi, WifiOff, Users, AlertTriangle, RefreshCw, Building2, UserCheck, Sparkles
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

interface EmployeeRecord {
  id: string;
  name: string;
  department?: string;
}

// Default Office coordinates (if not customized yet)
const DEFAULT_OFFICE_LAT = 24.7136;
const DEFAULT_OFFICE_LNG = 46.6753;
const DEFAULT_GEOFENCE_RADIUS_M = 200;

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>("idle");
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [employeeName, setEmployeeName] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("userName") || localStorage.getItem("lastCheckInEmployee") || "المدير العام (HR Manager)";
    }
    return "المدير العام (HR Manager)";
  });
  const [filterDate, setFilterDate] = useState(today);

  // Dynamic Office Geofence State
  const [officeLat, setOfficeLat] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hr_office_lat");
      if (saved) return parseFloat(saved);
    }
    return DEFAULT_OFFICE_LAT;
  });
  const [officeLng, setOfficeLng] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hr_office_lng");
      if (saved) return parseFloat(saved);
    }
    return DEFAULT_OFFICE_LNG;
  });
  const [geofenceRadiusM, setGeofenceRadiusM] = useState<number>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("hr_geofence_radius");
      if (saved) return parseInt(saved, 10);
    }
    return DEFAULT_GEOFENCE_RADIUS_M;
  });
  const [showSettings, setShowSettings] = useState(false);

  const currentTime = new Date().toLocaleTimeString(isRtl ? "ar-SA-u-nu-latn" : "en-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const workspaceId = typeof window !== "undefined"
    ? (localStorage.getItem("currentWorkspaceId") || "")
    : "";

  const fetchRecordsAndEmployees = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Attendance Records
      const res = await fetchWithAuth(`${API_BASE_URL}/entities?workspace_id=${workspaceId}&type=hr_attendance&limit=100`);
      if (res.ok) {
        const json = await res.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: AttendanceRecord[] = (json.data || []).map((e: any) => ({
          id: e.id || e.ID,
          employee_name: e.data?.employee_name || t("hr.unknownEmployee") || "موظف غير محدد",
          date: e.data?.date || today,
          check_in: e.data?.check_in,
          check_out: e.data?.check_out,
          location_verified: e.data?.location_verified ?? false,
          lat: e.data?.lat,
          lng: e.data?.lng,
          distance_meters: e.data?.distance_meters,
          status: e.data?.status || "present",
        }));
        setRecords(data.sort((a, b) => (b.check_in || b.date).localeCompare(a.check_in || a.date)));
      }

      // Fetch Employees for dropdown
      const empRes = await fetchWithAuth(`${API_BASE_URL}/employees?limit=50`);
      if (empRes.ok) {
        const empJson = await empRes.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const empList: EmployeeRecord[] = (empJson.data || []).map((e: any) => ({
          id: e.id || e.ID,
          name: e.data?.name || e.data?.full_name || "موظف",
          department: e.data?.department || "HR",
        }));
        setEmployees(empList);
      }
    } catch {
      // Keep records steady on error
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, today]);

  const saveOfficeSettings = (lat: number, lng: number, radius: number) => {
    setOfficeLat(lat);
    setOfficeLng(lng);
    setGeofenceRadiusM(radius);
    if (typeof window !== "undefined") {
      localStorage.setItem("hr_office_lat", lat.toString());
      localStorage.setItem("hr_office_lng", lng.toString());
      localStorage.setItem("hr_geofence_radius", radius.toString());
    }
    // Re-evaluate current user location if already located
    if (userLat !== null && userLng !== null) {
      const dist = haversineDistance(userLat, userLng, lat, lng);
      setDistanceM(Math.round(dist));
      setGeoStatus(dist <= radius ? "inside" : "outside");
    } else {
      setGeoStatus("inside");
      setDistanceM(0);
    }
    setSuccessMsg(`✅ ${isRtl ? "تم تحديث واعتماد إحداثيات الفرع الرئيسي بنجاح." : "Branch office geofence saved successfully."}`);
  };

  const locateUser = (silent = false) => {
    if (!silent) {
      setGeoStatus("locating");
      setErrorMsg(null);
    }
    if (!navigator.geolocation) {
      if (!silent) {
        setGeoStatus("error");
        setErrorMsg(t("hr.geoUnsupported") || "تحديد الموقع غير مدعوم في هذا المتصفح.");
      }
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const dist = haversineDistance(latitude, longitude, officeLat, officeLng);
        setUserLat(latitude);
        setUserLng(longitude);
        setDistanceM(Math.round(dist));
        setGeoStatus(dist <= geofenceRadiusM ? "inside" : "outside");
      },
      (err) => {
        if (!silent) {
          setGeoStatus("error");
          setErrorMsg(`${t("hr.locationErrorPrefix") || "خطأ الموقع: "}${err.message}`);
        }
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  };

  // Auto-locate and fetch data on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchRecordsAndEmployees();
      // Auto locate on first load
      locateUser(true);
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRecordsAndEmployees]);

  const simulateLocation = (lat: number, lng: number) => {
    const dist = haversineDistance(lat, lng, officeLat, officeLng);
    setUserLat(lat);
    setUserLng(lng);
    setDistanceM(Math.round(dist));
    setGeoStatus(dist <= geofenceRadiusM ? "inside" : "outside");
    setErrorMsg(null);
  };

  const handleCheckIn = async (customName?: string) => {
    const targetName = (customName || employeeName).trim();
    if (!targetName) {
      setErrorMsg(t("hr.enterNameFirst") || "يرجى إدخال اسم الموظف أولاً.");
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const now = new Date().toISOString();
    const checkInHour = new Date().getHours();
    const isLate = checkInHour >= 9; // Late if after 9AM
    const isInside = geoStatus === "inside" || distanceM === 0 || distanceM === null || (distanceM !== null && distanceM <= geofenceRadiusM);

    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("lastCheckInEmployee", targetName);
      }

      const res = await fetchWithAuth(`${API_BASE_URL}/entities?workspace_id=${workspaceId}`, {
        method: "POST",
        body: JSON.stringify({
          entity_type: "hr_attendance",
          name: `Attendance-${targetName}-${now}`,
          data: {
            employee_name: targetName,
            date: today,
            check_in: now,
            location_verified: isInside,
            lat: userLat || officeLat,
            lng: userLng || officeLng,
            distance_meters: distanceM !== null ? distanceM : 0,
            status: isInside ? (isLate ? "late" : "present") : "present",
            geofence_radius_m: geofenceRadiusM,
            office_lat: officeLat,
            office_lng: officeLng,
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to record check-in");
      
      const timeStr = formatTime(now, isRtl);
      setSuccessMsg(`✅ ${t("hr.checkInSuccess") || "تم تسجيل الحضور بنجاح للموظف"} (${targetName}) — ${t("hr.atTime") || "الساعة"} ${timeStr} ${isInside ? `📍 (${t("hr.insideGeofence") || "ضمن نطاق المكتب"})` : `⚠️ (${t("hr.outsideGeofence") || "تسجيل خارج النطاق"})`}`);
      fetchRecordsAndEmployees();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : (t("hr.recordFailed") || "فشل تسجيل الحضور"));
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
      : 8.0;

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
      setSuccessMsg(`✅ ${t("hr.checkOutSuccess") || "تم تسجيل الانصراف بنجاح للموظف"} (${record.employee_name}) — ${t("hr.worked") || "ساعات العمل"}: ${hoursWorked} ${t("hr.hours") || "ساعة"}`);
      fetchRecordsAndEmployees();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : (t("hr.recordFailed") || "فشل تسجيل الانصراف"));
    } finally {
      setSaving(false);
    }
  };

  const todayRecords = records.filter(r => r.date === filterDate || r.check_in?.startsWith(filterDate));
  const presentCount = todayRecords.filter(r => r.status === "present" || r.status === "checked_out" || r.status === "late").length;
  const lateCount = todayRecords.filter(r => r.status === "late").length;

  return (
    <div className="flex flex-col h-full bg-background w-full overflow-hidden">

      {/* Header */}
      <div className="flex-none px-8 py-6 border-b border-border bg-card shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black text-foreground flex items-center gap-2.5">
              <span className="p-2 bg-indigo-600 text-white rounded-xl shadow-md">
                <MapPin className="w-6 h-6" />
              </span>
              {t("hr.gpsAttendance") || "الحضور بنظام GPS المتقدم"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm font-medium">
              {t("hr.gpsAttendanceDesc") || "التحقق الجغرافي الفوري وتسجيل الحضور والانصراف للعاملين بالمكتب أو ميدانياً"}
            </p>
          </div>
          <div className="text-end flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 text-foreground font-mono text-xl font-black bg-muted px-3 py-1.5 rounded-xl border border-border shadow-inner">
              <Clock className="w-5 h-5 text-indigo-600 animate-pulse" />
              {currentTime}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-lg border border-border">
                📅 {formatDate(today, isRtl)}
              </span>
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-sm ${
                  showSettings ? "bg-indigo-600 text-white border-indigo-600 ring-2 ring-indigo-200" : "bg-card hover:bg-muted text-foreground border-border"
                }`}
              >
                ⚙️ {t("hr.geofenceSettings") || "إعدادات النطاق الجغرافي"}
              </button>
            </div>
          </div>
        </div>

        {/* KPI Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-emerald-600 bg-emerald-100 rounded-xl p-2 shadow-inner" />
              <div>
                <p className="text-xs text-muted-foreground font-bold">{t("hr.presentToday") || "الحاضرون اليوم"}</p>
                <p className="text-3xl font-black text-emerald-700 mt-0.5">{presentCount}</p>
              </div>
            </div>
            <span className="text-xs bg-emerald-100 text-emerald-800 font-extrabold px-2.5 py-1 rounded-full border border-emerald-300">
              {presentCount > 0 ? "نشط الآن ✅" : "بانتظار التسجيل"}
            </span>
          </div>
          <div className={`border rounded-2xl p-4 flex items-center justify-between shadow-sm transition-colors ${lateCount > 0 ? "bg-amber-50/80 border-amber-300" : "bg-card border-border"}`}>
            <div className="flex items-center gap-3">
              <AlertTriangle className={`w-10 h-10 rounded-xl p-2 shadow-inner ${lateCount > 0 ? "text-amber-700 bg-amber-100" : "text-muted-foreground bg-muted"}`} />
              <div>
                <p className="text-xs text-muted-foreground font-bold">{t("hr.lateEmployees") || "الموظفون المتأخرون"}</p>
                <p className={`text-3xl font-black mt-0.5 ${lateCount > 0 ? "text-amber-700" : "text-foreground"}`}>{lateCount}</p>
              </div>
            </div>
            <span className={`text-xs font-extrabold px-2.5 py-1 rounded-full border ${lateCount > 0 ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-muted text-muted-foreground border-border"}`}>
              {lateCount > 0 ? "يستدعي المتابعة ⚠️" : "منتظم بالوقت ✓"}
            </span>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <Users className="w-10 h-10 text-indigo-600 bg-indigo-50 rounded-xl p-2 shadow-inner" />
              <div>
                <p className="text-xs text-muted-foreground font-bold">{t("hr.totalRecords") || "إجمالي السجلّات المعتمدة"}</p>
                <p className="text-3xl font-black text-foreground mt-0.5">{todayRecords.length}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchRecordsAndEmployees}
              className="p-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-transparent hover:border-indigo-100 transition-all"
              title={t("common.refresh") || "تحديث البيانات"}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Office Geofence Settings Drawer/Card */}
        {showSettings && (
          <div className="mt-5 p-5 bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-2xl shadow-xl border border-indigo-700 animate-fadeIn">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-indigo-700/60">
              <h4 className="text-sm font-black flex items-center gap-2 text-indigo-100">
                <Building2 className="w-5 h-5 text-indigo-400" />
                {t("hr.geofenceConfigTitle") || "إعدادات إحداثيات ونطاق الحضور للمكتب الرئيسي (Branch Geofence)"}
              </h4>
              <span className="text-xs text-indigo-200 bg-indigo-950/80 border border-indigo-600 px-3 py-1 rounded-full font-mono font-bold">
                📍 {t("hr.currentBranch") || "الفرع الحالي"}: ({officeLat.toFixed(4)}, {officeLng.toFixed(4)}) — Radius: {geofenceRadiusM}m
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-indigo-200 mb-1.5">{t("hr.officeLat") || "خط العرض (Latitude)"}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={officeLat}
                  onChange={e => setOfficeLat(parseFloat(e.target.value) || 0)}
                  className="w-full text-sm bg-indigo-950/80 border border-indigo-600 rounded-xl px-3.5 py-2.5 text-white font-mono outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-200 mb-1.5">{t("hr.officeLng") || "خط الطول (Longitude)"}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={officeLng}
                  onChange={e => setOfficeLng(parseFloat(e.target.value) || 0)}
                  className="w-full text-sm bg-indigo-950/80 border border-indigo-600 rounded-xl px-3.5 py-2.5 text-white font-mono outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-indigo-200 mb-1.5">{t("hr.geofenceRadius") || "نطاق السماح (أمتار)"}</label>
                <input
                  type="number"
                  step="10"
                  value={geofenceRadiusM}
                  onChange={e => setGeofenceRadiusM(parseInt(e.target.value, 10) || 50)}
                  className="w-full text-sm bg-indigo-950/80 border border-indigo-600 rounded-xl px-3.5 py-2.5 text-white font-mono outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => saveOfficeSettings(officeLat, officeLng, geofenceRadiusM)}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-1.5"
                >
                  💾 {t("common.save") || "حفظ الإعدادات"}
                </button>
                {userLat !== null && userLng !== null && (
                  <button
                    type="button"
                    onClick={() => saveOfficeSettings(userLat, userLng, geofenceRadiusM)}
                    className="py-2.5 px-3 bg-indigo-500 hover:bg-indigo-400 text-white font-extrabold text-xs rounded-xl transition-all shadow-md whitespace-nowrap flex items-center justify-center gap-1"
                    title={t("hr.setMyPosAsOffice") || "اعتماد موقعي الحالي كموقع المكتب الرئيسي"}
                  >
                    📍 {t("hr.setAsOffice") || "موقعي الحالي كمكتب"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Check-in / Verification Panel */}
        <div className="lg:col-span-5 space-y-5">

          {/* Geo Verifier Card */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-foreground mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-indigo-600" />
                {t("hr.verifyLocation") || "التحقق الجغرافي ونطاق التواجد"}
              </span>
              <span className="text-xs bg-muted text-muted-foreground font-mono font-bold px-2.5 py-1 rounded-lg border border-border">
                {geofenceRadiusM}m Radius
              </span>
            </h3>

            <div className={`rounded-2xl p-5 mb-4 text-center border-2 transition-all shadow-sm ${
              geoStatus === "inside" ? "bg-emerald-50/90 border-emerald-400 text-emerald-900" :
              geoStatus === "outside" ? "bg-amber-50/90 border-amber-400 text-amber-900" :
              geoStatus === "locating" ? "bg-blue-50/90 border-blue-300 animate-pulse text-blue-900" :
              geoStatus === "error" ? "bg-rose-50/90 border-rose-300 text-rose-900" :
              "bg-muted border-border text-muted-foreground"
            }`}>
              {geoStatus === "idle" && (
                <>
                  <WifiOff className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-muted-foreground">{t("hr.clickToLocate") || "انقر أدناه لتحديد واختبار موقعك الحالي"}</p>
                </>
              )}
              {geoStatus === "locating" && (
                <>
                  <Wifi className="w-12 h-12 text-blue-500 mx-auto mb-2 animate-pulse" />
                  <p className="text-sm font-bold text-blue-700">{t("hr.locating") || "جارٍ التقاط إحداثيات الأقمار الصناعية (GPS)..."}</p>
                </>
              )}
              {geoStatus === "inside" && (
                <>
                  <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-2" />
                  <p className="text-base font-black text-emerald-800">✅ {t("hr.insideGeofence") || "أنت داخل نطاق المكتب الرئيسي المسموح"}</p>
                  <p className="text-xs text-emerald-700 font-bold mt-1">
                    {t("hr.distance") || "المسافة عن المركز"}: {distanceM || 0} {t("hr.meters") || "متر"} (ضمن النطاق {geofenceRadiusM}م)
                  </p>
                </>
              )}
              {geoStatus === "outside" && (
                <>
                  <AlertTriangle className="w-12 h-12 text-amber-600 mx-auto mb-2" />
                  <p className="text-base font-black text-amber-800">⚠️ {t("hr.outsideGeofence") || "خارج نطاق المكتب المسجل حالياً"}</p>
                  <p className="text-xs text-amber-700 font-bold mt-1">
                    {t("hr.distance") || "المسافة"}: {distanceM?.toLocaleString()}m — {t("hr.allowedRadius") || "النطاق المسموح"} {geofenceRadiusM}م
                  </p>
                  <p className="text-xs text-muted-foreground font-medium mt-2">
                    {t("hr.canRegisterButOutside") || "يمكنك تسجيل الحضور الميداني/الاستثنائي وسيتم تمييزه في السجلات"}
                  </p>

                  {/* Smart 1-Click Set As Office Banner for Tripoli/Remote setup */}
                  {userLat !== null && userLng !== null && (
                    <div className="mt-4 pt-3 border-t border-amber-200/80">
                      <p className="text-[11px] text-amber-900 font-bold mb-2">
                        💡 هل تتواجد حالياً في مقر المكتب الرئيسي للشركة وتود اعتماد موقعك كإحداثي رسمي؟
                      </p>
                      <button
                        type="button"
                        onClick={() => saveOfficeSettings(userLat, userLng, geofenceRadiusM)}
                        className="w-full py-2 bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-700 hover:to-indigo-700 text-white text-xs font-black rounded-xl shadow transition-all flex items-center justify-center gap-1.5"
                      >
                        📍 اعتماد موقعي الحالي كمقر المكتب الرئيسي فوراً (0m)
                      </button>
                    </div>
                  )}
                </>
              )}
              {geoStatus === "error" && (
                <>
                  <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-2" />
                  <p className="text-xs font-bold text-rose-700">{errorMsg}</p>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => locateUser(false)}
              disabled={geoStatus === "locating"}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50 mb-4"
            >
              <MapPin className="w-4 h-4" />
              {geoStatus === "locating" ? (t("hr.locating") || "جارٍ تحديد الموقع...") : `📍 ${t("hr.locateMe") || "تحديث وتحديد موقعي الجغرافي الآن"}`}
            </button>

            {/* GPS Simulator Quick Controls */}
            <div className="pt-3 border-t border-border">
              <p className="text-xs font-bold text-muted-foreground mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-indigo-700">
                  <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                  {t("hr.gpsSimulator") || "محاكاة الموقع للاختبار الفوري"}:
                </span>
                <span className="text-[11px] text-muted-foreground font-normal">{t("hr.simulationOnly") || "(لتجربة أزرار الحضور دون مشي)"}</span>
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => simulateLocation(officeLat, officeLng)}
                  className="py-2 px-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  ✅ {t("hr.simInside") || "داخل النطاق (0م)"}
                </button>
                <button
                  type="button"
                  onClick={() => simulateLocation(officeLat + 0.0040, officeLng)}
                  className="py-2 px-3 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5"
                >
                  ⚠️ {t("hr.simOutside") || "خارج النطاق (440م)"}
                </button>
              </div>
            </div>
          </div>

          {/* Check-in Form */}
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            <h3 className="text-sm font-extrabold text-foreground mb-4 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <LogIn className="w-4 h-4 text-emerald-600" />
                {t("hr.checkIn") || "تسجيل الحضور اليومي الفوري"}
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                {today}
              </span>
            </h3>

            {successMsg && (
              <div className="mb-4 p-3.5 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-800 font-bold animate-fadeIn flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}
            {errorMsg && geoStatus !== "error" && (
              <div className="mb-4 p-3.5 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-bold animate-fadeIn flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* Quick 1-Click check-in for Logged in User */}
              <button
                type="button"
                onClick={() => handleCheckIn(employeeName || "المدير العام (HR Manager)")}
                disabled={saving}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-black text-sm flex items-center justify-center gap-2 shadow-lg hover:shadow-xl transition-all disabled:opacity-50"
              >
                <UserCheck className="w-5 h-5" />
                {saving ? (t("common.loading") || "جارٍ التسجيل...") : `⚡ ${t("hr.quickCheckInUser") || "تسجيل الحضور الفوري لحسابي الآن"} (${employeeName})`}
              </button>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-border"></div>
                <span className="flex-shrink mx-3 text-xs font-bold text-muted-foreground uppercase">
                  {isRtl ? "أو تسجيل موظف آخر" : "OR SELECT EMPLOYEE"}
                </span>
                <div className="flex-grow border-t border-border"></div>
              </div>

              {/* Employee Selection Dropdown + Input */}
              <div>
                <label htmlFor="emp_name" className="block text-xs font-bold text-foreground mb-1.5">
                  {t("hr.selectEmployeeOrType") || "اختر موظفاً من القائمة أو أدخل الاسم:"}
                </label>
                
                {employees.length > 0 && (
                  <div className="mb-2.5">
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          setEmployeeName(e.target.value);
                        }
                      }}
                      value={employees.some(emp => emp.name === employeeName) ? employeeName : ""}
                      className="w-full bg-muted border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground focus:border-indigo-500 outline-none"
                    >
                      <option value="">-- {isRtl ? "اختر موظفاً مسجلاً في النظام..." : "Select registered employee..."} --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.name}>
                          {emp.name} ({emp.department})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <input
                  id="emp_name"
                  type="text"
                  value={employeeName}
                  onChange={e => setEmployeeName(e.target.value)}
                  placeholder={t("hr.enterFullName") || "أدخل الاسم الكامل للموظف..."}
                  className="w-full bg-card border border-border rounded-xl px-3.5 py-2.5 text-sm font-semibold text-foreground focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => handleCheckIn()}
                disabled={saving || !employeeName.trim()}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                <LogIn className="w-4 h-4" />
                {saving ? (t("common.loading") || "جارٍ المعالجة...") : `✅ ${t("hr.checkIn") || "تسجيل الحضور للموظف المختار"}`}
              </button>
            </div>
          </div>
        </div>

        {/* Attendance Log */}
        <div className="lg:col-span-7">
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden h-full flex flex-col">
            <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-muted/50">
              <div>
                <h3 className="text-base font-black text-foreground flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  {t("hr.attendanceLog") || "سجلّات حضور اليوم والمتابعة المباشرة"}
                </h3>
                <p className="text-xs text-muted-foreground font-medium mt-0.5">
                  {isRtl ? "إحصاءات الحضور والانصراف الموثقة جغرافياً لهذا اليوم" : "Geographically verified check-ins & check-outs for today"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={filterDate}
                  aria-label={t("hr.logsDate") || "تاريخ السجلات"}
                  title={t("hr.logsDate") || "تاريخ السجلات"}
                  onChange={e => setFilterDate(e.target.value)}
                  className="text-xs font-bold border border-border rounded-xl px-3 py-2 text-foreground focus:border-indigo-500 outline-none bg-card shadow-sm"
                />
                <button
                  type="button"
                  onClick={fetchRecordsAndEmployees}
                  className="p-2 text-muted-foreground hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-border hover:border-indigo-200 transition-all shadow-sm"
                  title={t("common.refresh") || "تحديث"}
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-indigo-600" : ""}`} />
                </button>
              </div>
            </div>

            {loading && records.length === 0 ? (
              <div className="p-16 text-center text-muted-foreground text-sm flex flex-col items-center justify-center flex-1">
                <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin mb-3" />
                <p className="font-bold">{t("common.loading") || "جارٍ تحميل سجلات الحضور من قاعدة البيانات..."}</p>
              </div>
            ) : todayRecords.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center justify-center flex-1 bg-muted/30">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4 text-muted-foreground">
                  <Users className="w-8 h-8" />
                </div>
                <p className="text-muted-foreground font-bold text-base">{t("hr.noAttendanceRecords") || "لا توجد سجلّات حضور مسجلة لهذا اليوم"}</p>
                <p className="text-muted-foreground text-xs mt-1 font-medium">{t("hr.startCheckIn") || "انقر على «تسجيل الحضور الفوري لحسابي الآن» أو زر المحاكاة للبدء الفوري"}</p>
              </div>
            ) : (
              <div className="divide-y divide-border overflow-y-auto flex-1">
                {todayRecords.map((record) => (
                  <div key={record.id} className="px-6 py-4.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-indigo-50/30 transition-all">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-base font-black text-white shadow-sm flex-shrink-0">
                        {record.employee_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-foreground">{record.employee_name}</p>
                        <div className="flex flex-wrap items-center gap-3 mt-1">
                          <span className="text-xs font-bold text-muted-foreground flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <LogIn className="w-3.5 h-3.5 text-emerald-600" />
                            {t("hr.checkIn") || "حضور"}: {formatTime(record.check_in, isRtl)}
                          </span>
                          {record.check_out && (
                            <span className="text-xs font-bold text-muted-foreground flex items-center gap-1 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              <LogOut className="w-3.5 h-3.5 text-rose-500" />
                              {t("hr.checkOut") || "انصراف"}: {formatTime(record.check_out, isRtl)}
                            </span>
                          )}
                          <span className={`text-xs font-bold flex items-center gap-1 px-2 py-0.5 rounded-md border ${
                            record.location_verified
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                              : "bg-amber-50 text-amber-800 border-amber-200"
                          }`}>
                            <MapPin className="w-3.5 h-3.5" />
                            {record.location_verified
                              ? (isRtl ? `ضمن النطاق (${record.distance_meters || 0}م)` : `Verified (${record.distance_meters || 0}m)`)
                              : (isRtl ? `خارج النطاق (${record.distance_meters || 0}م)` : `Outside (${record.distance_meters || 0}m)`)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-center">
                      {/* Status Badge */}
                      {record.status === "present" && <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">✅ {t("common.present") || "حاضر بالمكتب"}</span>}
                      {record.status === "late" && <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-amber-100 text-amber-800 border border-amber-300">⏰ {t("hr.late") || "متأخر"}</span>}
                      {record.status === "checked_out" && <span className="px-3 py-1 text-xs font-extrabold rounded-full bg-muted text-foreground border border-border">✓ {t("hr.checkedOut") || "انصرف"}</span>}

                      {/* Checkout Button */}
                      {!record.check_out && (
                        <button
                          type="button"
                          onClick={() => handleCheckOut(record)}
                          disabled={saving}
                          className="px-3.5 py-2 text-xs font-extrabold text-rose-700 bg-rose-50 border border-rose-300 hover:bg-rose-100 hover:border-rose-400 rounded-xl transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          {t("hr.checkOut") || "تسجيل الانصراف الآن"}
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
