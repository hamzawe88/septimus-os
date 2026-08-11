"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Headphones,
  Plus,
  Users,
  Video,
} from "lucide-react";

import { useLocalization } from "@/contexts/LocalizationContext";
import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";

const ROOMS = [
  { id: "r1", nameKey: "r1Name", activeCount: 4, type: "voice" },
  { id: "r2", nameKey: "r2Name", activeCount: 2, type: "video" },
] as const;

export default function QuickConnectWidget() {
  const { t } = useLocalization();
  const [joinedRoom, setJoinedRoom] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-xs font-bold">
          <Headphones className="size-4 text-brand" aria-hidden />
          {t("dashboard.huddles.title")}
        </h3>
        <Tag tone="brand">
          {ROOMS.reduce((sum, room) => sum + room.activeCount, 0)}{" "}
          {t("dashboard.huddles.online")}
        </Tag>
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto">
        {ROOMS.map((room) => {
          const isJoined = joinedRoom === room.id;
          const RoomIcon = room.type === "video" ? Video : Headphones;
          return (
            <article
              key={room.id}
              className={`flex flex-col gap-3 rounded-[var(--radius-surface)] border p-3.5 transition-colors ${
                isJoined
                  ? "border-brand/30 bg-brand-light"
                  : "border-border bg-muted/35"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-brand text-brand-foreground">
                    <RoomIcon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h4 className="truncate text-xs font-bold">
                      {t(`dashboard.huddles.${room.nameKey}`)}
                    </h4>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3" aria-hidden />
                      {room.activeCount} {t("dashboard.huddles.participants")}
                    </span>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isJoined ? "secondary" : "default"}
                  onClick={() => setJoinedRoom(isJoined ? null : room.id)}
                >
                  {isJoined ? <CheckCircle2 /> : <Plus />}
                  {isJoined
                    ? t("dashboard.huddles.joined")
                    : t("dashboard.huddles.join")}
                </Button>
              </div>
              {isJoined ? (
                <div className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-success/20 bg-success/10 p-2 text-xs font-bold text-success">
                  <span className="size-2 animate-pulse rounded-full bg-success" />
                  {t("dashboard.huddles.micActive")}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </div>
  );
}
