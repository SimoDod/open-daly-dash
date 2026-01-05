/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DeviceInfo, Point, RangeKey, Snapshot } from "@/lib/types/bms";
import { toast } from "sonner";

const MAX_POINTS = 60000;
const FLUSH_MS = 3500;

type Status =
  | "idle"
  | "connecting"
  | "connected"
  | "ready"
  | "degraded"
  | "disconnected";

type BmsId = 1 | 2;

type BmsState = {
  status: Status;
  connecting: boolean;
  connected: boolean;
  device: DeviceInfo | null;
  snapshot: Snapshot | null;
  chartData: Point[];
};

export function useBmsDashboard() {
  const [pass, setPass] = useState<string>(() => {
    try {
      return typeof window !== "undefined"
        ? localStorage.getItem("dash_pass") || ""
        : "";
    } catch {
      return "";
    }
  });

  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  const [tryToConnectOnce, setTryToConnectOnce] = useState(true);

  // State per BMS
  const [bms, setBms] = useState<Record<BmsId, BmsState>>({
    1: {
      status: "idle",
      connecting: false,
      connected: false,
      device: null,
      snapshot: null,
      chartData: [],
    },
    2: {
      status: "idle",
      connecting: false,
      connected: false,
      device: null,
      snapshot: null,
      chartData: [],
    },
  });

  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const [range, setRange] = useState<RangeKey>("24h");

  const [showV, setShowV] = useState(false);
  const [showI, setShowI] = useState(true);
  const [showSoc, setShowSoc] = useState(true);

  const bufferRef = useRef<Record<BmsId, Point[]>>({ 1: [], 2: [] });
  const flushTimerRef = useRef<
    Record<BmsId, ReturnType<typeof setTimeout> | null>
  >({ 1: null, 2: null });
  const evtRef = useRef<EventSource | null>(null);
  const readyStatePollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scheduleFlush = useCallback((id: BmsId) => {
    if (flushTimerRef.current[id]) return;
    flushTimerRef.current[id] = setTimeout(() => {
      flushTimerRef.current[id] = null;
      setBms((prev) => {
        const buffer = bufferRef.current[id];
        if (buffer.length === 0) return prev;

        const merged = prev[id].chartData.concat(buffer);
        bufferRef.current[id] = [];
        const trimmed =
          merged.length > MAX_POINTS ? merged.slice(-MAX_POINTS) : merged;

        return {
          ...prev,
          [id]: { ...prev[id], chartData: trimmed },
        };
      });
    }, FLUSH_MS);
  }, []);

  const connect = useCallback(() => {
    if (!pass) return;
    try {
      localStorage.setItem("dash_pass", pass);
    } catch {}

    evtRef.current?.close();
    evtRef.current = null;

    setBms((prev) => ({
      1: { ...prev[1], connecting: true, status: "connecting" },
      2: { ...prev[2], connecting: true, status: "connecting" },
    }));

    if (!isOnline) {
      setBms((prev) => ({
        1: { ...prev[1], status: "disconnected", connecting: false },
        2: { ...prev[2], status: "disconnected", connecting: false },
      }));
      toast.error("Offline");
      return;
    }

    const es = new EventSource(
      `/api/bms/events?pass=${encodeURIComponent(pass)}`
    );
    evtRef.current = es;

    if (readyStatePollRef.current) clearInterval(readyStatePollRef.current);
    readyStatePollRef.current = setInterval(() => {
      if (!evtRef.current) return;
      const rs = evtRef.current.readyState;
      if (rs === 0) {
        setBms((prev) => ({
          1: { ...prev[1], connecting: true },
          2: { ...prev[2], connecting: true },
        }));
      } else if (rs === 1) {
        setBms((prev) => ({
          1: { ...prev[1], connected: true, connecting: false },
          2: { ...prev[2], connected: true, connecting: false },
        }));
      } else if (rs === 2) {
        setBms((prev) => ({
          1: { ...prev[1], connected: false, status: "disconnected" },
          2: { ...prev[2], connected: false, status: "disconnected" },
        }));
      }
    }, 800);

    es.onmessage = (msg) => {
      if (msg.data.startsWith(":")) return; // keepalive

      try {
        const evt = JSON.parse(msg.data);

        // Skip hello — we handle per-BMS events
        if (evt.event === "hello") return;

        const id: BmsId = evt.bmsId || 1; // fallback to 1 if missing (legacy)

        switch (evt.event) {
          case "connected":
            setBms((prev) => ({
              ...prev,
              [id]: {
                ...prev[id],
                device: evt.device,
                connected: true,
                connecting: false,
                status: "connected",
              },
            }));
            break;

          case "ready":
            setBms((prev) => ({
              ...prev,
              [id]: { ...prev[id], status: "ready" },
            }));
            break;

          case "state": {
            const s: Snapshot = evt.snapshot || {};
            setBms((prev) => ({
              ...prev,
              [id]: { ...prev[id], snapshot: s },
            }));

            if (!pausedRef.current) {
              const p: Point = {
                ts: new Date().toLocaleTimeString(),
                v: s.voltage_V,
                i: s.current_A,
                soc: s.soc_pct,
              };
              bufferRef.current[id].push(p);

              if (bufferRef.current[id].length > MAX_POINTS * 2) {
                bufferRef.current[id] = bufferRef.current[id].slice(
                  -MAX_POINTS
                );
              }

              scheduleFlush(id);
            }
            break;
          }

          case "no_data":
            setBms((prev) => ({
              ...prev,
              [id]: { ...prev[id], status: "degraded" },
            }));
            toast.warning(`BMS ${id}: No data`, {
              description: `Idle for ${Math.round((evt.for_ms || 0) / 1000)}s`,
            });
            break;

          case "tx_error":
            setBms((prev) => ({
              ...prev,
              [id]: {
                ...prev[id],
                status:
                  prev[id].status === "ready" ? "degraded" : prev[id].status,
              },
            }));
            toast.error(`BMS ${id}: Write failed`, {
              description: evt.message,
            });
            break;

          case "disconnected":
            setBms((prev) => ({
              ...prev,
              [id]: {
                ...prev[id],
                connected: false,
                connecting: false,
                status: "disconnected",
              },
            }));
            toast.error(`BMS ${id} disconnected`, { description: evt.reason });
            break;
        }
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };
  }, [pass, isOnline, scheduleFlush]);

  const disconnect = useCallback(() => {
    evtRef.current?.close();
    evtRef.current = null;
    if (readyStatePollRef.current) clearInterval(readyStatePollRef.current);

    setBms({
      1: {
        status: "disconnected",
        connecting: false,
        connected: false,
        device: null,
        snapshot: null,
        chartData: [],
      },
      2: {
        status: "disconnected",
        connecting: false,
        connected: false,
        device: null,
        snapshot: null,
        chartData: [],
      },
    });
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const loadHistory = useCallback(
    async (r: RangeKey, bmsId?: BmsId) => {
      const now = new Date();
      let from: Date;
      switch (r) {
        case "1h":
          from = new Date(now.getTime() - 3600e3);
          break;
        case "6h":
          from = new Date(now.getTime() - 6 * 3600e3);
          break;
        case "24h":
          from = new Date(now.getTime() - 24 * 3600e3);
          break;
        case "1w":
          from = new Date(now.getTime() - 7 * 24 * 3600e3);
          break;
        default:
          from = new Date(now.getTime() - 24 * 3600e3);
      }

      let url = `/api/bms/history?from=${encodeURIComponent(
        from.toISOString()
      )}&to=${encodeURIComponent(now.toISOString())}`;
      if (bmsId) url += `&bmsId=${bmsId}`;

      try {
        const res = await fetch(url, { headers: { "x-pass": pass } });
        if (!res.ok) return;

        const js = await res.json();
        const rawData = js.data;

        // Handle three possible formats from backend:
        // 1. Flat array (legacy)
        // 2. Grouped object { "1": [...], "2": [...] }
        // 3. Already filtered array (when bmsId specified)

        let entries: any[] = [];

        if (Array.isArray(rawData)) {
          // Case 1 or 3: flat or filtered
          entries = rawData;
        } else if (rawData && typeof rawData === "object") {
          // Case 2: grouped
          if (bmsId) {
            entries = rawData[bmsId] || [];
          } else {
            // Load both — merge arrays
            entries = [...(rawData["1"] || []), ...(rawData["2"] || [])];
          }
        }

        const pts: Point[] = entries
          .filter((d: any) => d && d.snapshot)
          .map((d: any) => ({
            ts: new Date(d.ts).toLocaleTimeString(),
            v: d.snapshot.voltage_V,
            i: d.snapshot.current_A,
            soc: d.snapshot.soc_pct,
          }));

        // If specific BMS requested → update only that one
        if (bmsId) {
          bufferRef.current[bmsId] = [];
          setBms((prev) => ({
            ...prev,
            [bmsId]: { ...prev[bmsId], chartData: pts.slice(-MAX_POINTS) },
          }));
        } else {
          // Update both separately from grouped data
          bufferRef.current[1] = [];
          bufferRef.current[2] = [];

          const pts1 = (rawData["1"] || [])
            .filter((d: any) => d && d.snapshot)
            .map((d: any) => ({
              ts: new Date(d.ts).toLocaleTimeString(),
              v: d.snapshot.voltage_V,
              i: d.snapshot.current_A,
              soc: d.snapshot.soc_pct,
            }));

          const pts2 = (rawData["2"] || [])
            .filter((d: any) => d && d.snapshot)
            .map((d: any) => ({
              ts: new Date(d.ts).toLocaleTimeString(),
              v: d.snapshot.voltage_V,
              i: d.snapshot.current_A,
              soc: d.snapshot.soc_pct,
            }));

          setBms((prev) => ({
            ...prev,
            1: { ...prev[1], chartData: pts1.slice(-MAX_POINTS) },
            2: { ...prev[2], chartData: pts2.slice(-MAX_POINTS) },
          }));
        }
      } catch (err) {
        console.error("History load failed:", err);
      }
    },
    [pass]
  );

  // Auto-connect
  useEffect(() => {
    if (pass && tryToConnectOnce) {
      connect();
      setTryToConnectOnce(false);
    }
  }, [pass, connect, tryToConnectOnce]);

  // Load initial history
  useEffect(() => {
    if (pass) loadHistory("24h");
  }, [pass, loadHistory]);

  // Online/offline handling
  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      if (pass) connect();
    };
    const onOffline = () => {
      setIsOnline(false);
      disconnect();
      toast.error("Offline");
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [connect, disconnect, pass]);

  // Compute cell delta per BMS
  const cellDeltas = useMemo(() => {
    return {
      1: computeCellDelta(bms[1].snapshot),
      2: computeCellDelta(bms[2].snapshot),
    };
  }, [bms]);

  function computeCellDelta(snapshot: Snapshot | null) {
    if (!snapshot || snapshot.cellMin_V == null || snapshot.cellMax_V == null)
      return null;
    const deltaV = snapshot.cellMax_V - snapshot.cellMin_V;
    return { minV: snapshot.cellMin_V, maxV: snapshot.cellMax_V, deltaV };
  }

  return {
    pass,
    setPass,

    // Per-BMS access
    bms, // { 1: {...}, 2: {...} }

    // Convenience helpers
    getBms: (id: BmsId) => bms[id],
    getSnapshot: (id: BmsId) => bms[id].snapshot,
    getDevice: (id: BmsId) => bms[id].device,
    getChartData: (id: BmsId) => bms[id].chartData,
    getStatus: (id: BmsId) => bms[id].status,

    // Global controls
    paused,
    togglePause,
    range,
    setRange,
    loadHistory,

    // Chart visibility
    showV,
    setShowV,
    showI,
    setShowI,
    showSoc,
    setShowSoc,

    // Cell balance
    cellDeltas,

    // Connection
    connect,
    disconnect,
    isOnline,
  };
}
