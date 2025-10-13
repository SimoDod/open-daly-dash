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

  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [lastError, setLastError] = useState<string | null>(null);

  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [range, setRange] = useState<RangeKey>("24h");

  const [chartData, setChartData] = useState<Point[]>([]);
  const bufferRef = useRef<Point[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const evtRef = useRef<EventSource | null>(null);

  const [showV, setShowV] = useState(true);
  const [showI, setShowI] = useState(true);
  const [showSoc, setShowSoc] = useState(true);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      setChartData((prev) => {
        const merged = prev.concat(bufferRef.current);
        bufferRef.current = [];
        return merged.length > MAX_POINTS ? merged.slice(-MAX_POINTS) : merged;
      });
    }, FLUSH_MS);
  }, []);

  const connect = useCallback(() => {
    if (!pass) return;
    try {
      localStorage.setItem("dash_pass", pass);
    } catch {}
    evtRef.current?.close();
    setConnecting(true);
    setConnected(false);
    setStatus("connecting");
    setLastError(null);

    const es = new EventSource(
      `/api/bms/events?pass=${encodeURIComponent(pass)}`
    );
    evtRef.current = es;

    es.onopen = () => {
      setConnecting(false);
      setConnected(true);
      setStatus("connected");
    };

    es.onmessage = (msg) => {
      try {
        const evt = JSON.parse(msg.data);

        switch (evt.event) {
          case "hello":
            setConnected(true);
            setConnecting(false);
            setStatus("connected");
            break;

          case "connecting":
            setStatus("connecting");
            break;

          case "connected":
            setDevice(evt.device as DeviceInfo);
            setStatus("connected");
            toast.success("BLE connected", {
              description: evt.device?.name || "BMS",
            });
            break;

          case "ready":
            setStatus("ready");
            toast.success("BMS data streaming");
            break;

          case "state": {
            const s: Snapshot = evt.snapshot || {};
            setSnapshot(s);
            if (!paused) {
              const p: Point = {
                ts: new Date().toLocaleTimeString(),
                v: s.voltage_V,
                i: s.current_A,
                soc: s.soc_pct,
              };
              bufferRef.current.push(p);
              if (bufferRef.current.length > MAX_POINTS * 2) {
                bufferRef.current = bufferRef.current.slice(-MAX_POINTS);
              }
              scheduleFlush();
            }
            break;
          }

          case "no_data":
            setStatus("degraded");
            toast.warning("No data from BMS", {
              description: `Idle for ${Math.round((evt.for_ms || 0) / 1000)}s`,
            });
            break;

          case "tx_error":
            setStatus((s) => (s === "ready" ? "degraded" : s));
            setLastError(evt.message || "Write error");
            toast.error("BLE write failed", { description: evt.message });
            break;

          case "disconnected":
            setConnecting(false);
            setConnected(false);
            setStatus("disconnected");
            setLastError(evt.reason || "Disconnected");
            toast.error("BLE disconnected", { description: evt.reason });
            break;

          default:
            // ignore other events or add more cases if you forward more
            break;
        }
      } catch {
        // ignore malformed
      }
    };

    es.onerror = () => {
      setConnecting(false);
      setConnected(false);
      setStatus("disconnected");
      if (!lastError) {
        setLastError("Event stream error");
      }
      toast.error("Event stream error", {
        description: "Check server/network connectivity",
      });
    };
  }, [pass, paused, scheduleFlush, lastError]);

  const disconnect = useCallback(() => {
    evtRef.current?.close();
    evtRef.current = null;
    setConnecting(false);
    setConnected(false);
    setStatus("disconnected");
  }, []);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  const loadHistory = useCallback(
    async (r: RangeKey) => {
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
        case "1m":
          from = new Date(now.getTime() - 30 * 24 * 3600e3);
          break;
        default:
          from = new Date(now.getTime() - 24 * 3600e3);
      }
      const url = `/api/bms/history?from=${encodeURIComponent(
        from.toISOString()
      )}&to=${encodeURIComponent(now.toISOString())}&limit=15000`;
      try {
        const res = await fetch(url, {
          headers: { "x-pass": pass },
        });
        if (!res.ok) return;
        const js = await res.json();
        const pts: Point[] = (
          js.data as Array<{ ts: string; snapshot: Snapshot }>
        ).map((d) => ({
          ts: new Date(d.ts).toLocaleTimeString(),
          v: d.snapshot?.voltage_V,
          i: d.snapshot?.current_A,
          soc: d.snapshot?.soc_pct,
        }));
        bufferRef.current = [];
        setChartData(pts.slice(-MAX_POINTS));
      } catch {}
    },
    [pass]
  );

  useEffect(() => {
    try {
      if (pass) {
        connect();
        localStorage.setItem("dash_pass", pass);
      } else {
        localStorage.removeItem("dash_pass");
      }
    } catch {}
  }, [connect, pass]);

  useEffect(() => {
    if (!pass) return;
    loadHistory("24h");
    return () => {
      evtRef.current?.close();
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pass]);

  const cellDelta = useMemo(() => {
    if (snapshot?.cellMin_V == null || snapshot?.cellMax_V == null) return null;
    const minV = snapshot.cellMin_V;
    const maxV = snapshot.cellMax_V;
    const deltaV = maxV - minV;
    return { minV, maxV, deltaV };
  }, [snapshot]);

  return {
    pass,
    setPass,
    connected,
    connecting,
    status,
    lastError,
    connect,
    disconnect,
    paused,
    togglePause,
    snapshot,
    device,
    range,
    setRange,
    loadHistory,
    chartData,
    showV,
    setShowV,
    showI,
    setShowI,
    showSoc,
    setShowSoc,
    cellDelta,
  };
}
