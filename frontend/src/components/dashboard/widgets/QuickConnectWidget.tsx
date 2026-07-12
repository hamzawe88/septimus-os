"use client";

import React, { useState } from "react";
import { Headphones, Video, Plus, CheckCircle2, Users } from "lucide-react";
import { useLocalization } from "@/contexts/LocalizationContext";

export default function QuickConnectWidget() {
  const { t } = useLocalization();
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);

  const rooms = [
    { id: "r1", name: t("dashboard.huddles.r1Name", "#engineering-huddle"), activeCount: 4, type: "voice" },
    { id: "r2", name: t("dashboard.huddles.r2Name", "#executive-briefing"), activeCount: 2, type: "video" },
  ];

  return (
    <div className="flex flex-col justify-between h-full space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
          <Headphones className="w-4 h-4 text-pink-500" />
          {t("dashboard.huddles.title", "Live Team Huddles")}
        </span>
        <span className="text-[10px] font-extrabold bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-300 px-2 py-0.5 rounded-full">
          {rooms.reduce((s, r) => s + r.activeCount, 0)} {t("dashboard.huddles.online", "Online")}
        </span>
      </div>

      {/* Huddle Rooms */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1">
        {rooms.map((room) => {
          const isJoined = joinedRoom === room.id;
          return (
            <div
              key={room.id}
              className={`p-3.5 rounded-2xl border transition flex flex-col gap-3 ${
                isJoined
                  ? "bg-pink-50 dark:bg-pink-950/30 border-pink-300 dark:border-pink-800"
                  : "bg-slate-50 dark:bg-slate-800/80 border-slate-200/80 dark:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm ${
                      room.type === "video" ? "bg-purple-600" : "bg-pink-600"
                    }`}
                  >
                    {room.type === "video" ? <Video className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white">{room.name}</h4>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      <span>
                        {room.activeCount} {t("dashboard.huddles.participants", "participants inside")}
                      </span>
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setJoinedRoom(isJoined ? null : room.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                    isJoined
                      ? "bg-emerald-500 text-white"
                      : "bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 text-white shadow-sm"
                  }`}
                >
                  {isJoined ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>{isJoined ? t("dashboard.huddles.joined", "Connected") : t("dashboard.huddles.join", "Join")}</span>
                </button>
              </div>

              {isJoined && (
                <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-pink-200 dark:border-pink-900/50 flex items-center justify-between text-xs animate-in fade-in duration-200">
                  <span className="flex items-center gap-1.5 font-bold text-pink-600 dark:text-pink-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                    <span>{t("dashboard.huddles.micActive", "Microphone Live • Sovereign Audio Mesh")}</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
