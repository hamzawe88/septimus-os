"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FieldSchema } from "./types";

export interface SchemaDraftSnapshot {
  definitionKey: string;
  labelAr: string;
  labelEn: string;
  titleFieldKey: string;
  fields: FieldSchema[];
}

const cloneSnapshot = (snapshot: SchemaDraftSnapshot): SchemaDraftSnapshot =>
  JSON.parse(JSON.stringify(snapshot)) as SchemaDraftSnapshot;

const signature = (snapshot: SchemaDraftSnapshot) => JSON.stringify(snapshot);

export function useSchemaDraftHistory(
  snapshot: SchemaDraftSnapshot,
  onApply: (snapshot: SchemaDraftSnapshot) => void,
) {
  const historyRef = useRef<SchemaDraftSnapshot[]>([cloneSnapshot(snapshot)]);
  const cursorRef = useRef(0);
  const suppressedSignatureRef = useRef<string | null>(null);
  const [availability, setAvailability] = useState({
    canUndo: false,
    canRedo: false,
  });
  const snapshotSignature = signature(snapshot);

  const updateAvailability = useCallback(() => {
    setAvailability({
      canUndo: cursorRef.current > 0,
      canRedo: cursorRef.current < historyRef.current.length - 1,
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (suppressedSignatureRef.current === snapshotSignature) {
        suppressedSignatureRef.current = null;
        return;
      }
      const current = historyRef.current[cursorRef.current];
      if (current && signature(current) === snapshotSignature) return;
      const retained = historyRef.current.slice(0, cursorRef.current + 1);
      retained.push(cloneSnapshot(snapshot));
      if (retained.length > 50) retained.shift();
      historyRef.current = retained;
      cursorRef.current = retained.length - 1;
      updateAvailability();
    }, 250);
    return () => window.clearTimeout(timer);
  }, [snapshot, snapshotSignature, updateAvailability]);

  const applyAt = useCallback(
    (index: number) => {
      const target = historyRef.current[index];
      if (!target) return;
      cursorRef.current = index;
      const next = cloneSnapshot(target);
      suppressedSignatureRef.current = signature(next);
      onApply(next);
      updateAvailability();
    },
    [onApply, updateAvailability],
  );

  const undo = useCallback(() => {
    if (cursorRef.current > 0) applyAt(cursorRef.current - 1);
  }, [applyAt]);

  const redo = useCallback(() => {
    if (cursorRef.current < historyRef.current.length - 1) {
      applyAt(cursorRef.current + 1);
    }
  }, [applyAt]);

  const resetHistory = useCallback(
    (next: SchemaDraftSnapshot) => {
      const cloned = cloneSnapshot(next);
      historyRef.current = [cloned];
      cursorRef.current = 0;
      suppressedSignatureRef.current = signature(cloned);
      updateAvailability();
    },
    [updateAvailability],
  );

  return {
    ...availability,
    undo,
    redo,
    resetHistory,
  };
}
