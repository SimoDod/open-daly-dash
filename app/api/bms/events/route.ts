/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { BmsEvent, getBmsService } from "@/lib/bms/service";

const DASH_PASS = process.env.DASH_PASS;

function isAuthed(req: NextRequest) {
  const pass =
    req.nextUrl.searchParams.get("pass") || req.headers.get("x-pass");
  return pass && pass === DASH_PASS;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const svc = getBmsService();
  await svc.ensureStarted();

  const debug = req.nextUrl.searchParams.get("debug") === "1";

  // Throttle state updates per BMS (max once every 2 seconds)
  const lastStateSent = { 1: 0, 2: 0 };
  const STATE_THROTTLE_MS = 2000;

  const stream = new ReadableStream({
    start(controller) {
      const write = (obj: any) => {
        controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
      };

      // Initial greeting
      write({ ts: new Date().toISOString(), event: "hello" });

      // Send current status once at connect
      ([1, 2] as const).forEach((id) => {
        const connected = svc.getIsConnected(id);
        const ready = svc.getIsReady(id);
        const device = svc.getDeviceInfo(id);
        const snapshot = svc.getLastSnapshot(id);

        if (connected) {
          write({
            ts: new Date().toISOString(),
            bmsId: id,
            event: "connected",
            device: device ?? undefined,
          });

          if (ready) {
            write({
              ts: new Date().toISOString(),
              bmsId: id,
              event: "ready",
            });
          }
        } else {
          write({
            ts: new Date().toISOString(),
            bmsId: id,
            event: "disconnected",
          });
        }

        if (snapshot) {
          write({
            ts: new Date().toISOString(),
            bmsId: id,
            event: "state",
            snapshot,
          });
          lastStateSent[id] = Date.now();
        }
      });

      const onEvt = (evt: BmsEvent) => {
        if (debug) {
          write(evt);
          return;
        }

        const now = Date.now();

        // Always forward critical status changes
        if (
          evt.event === "connected" ||
          evt.event === "ready" ||
          evt.event === "disconnected" ||
          evt.event === "no_data" ||
          evt.event === "tx_error"
        ) {
          write(evt);
          return;
        }

        // Throttle "state" updates — only send if >2s since last one per BMS
        if (evt.event === "state") {
          if (now - lastStateSent[evt.bmsId] >= STATE_THROTTLE_MS) {
            write(evt);
            lastStateSent[evt.bmsId] = now;
          }
          // Otherwise drop — UI already has recent data
          return;
        }

        // Drop everything else (tx, decoded, etc.)
      };

      // Longer keepalive — reduces noise
      const ping = setInterval(() => {
        controller.enqueue(`: ping\n\n`);
      }, 30000); // 30s

      svc.on("evt", onEvt);

      const close = () => {
        clearInterval(ping);
        svc.off("evt", onEvt);
        controller.close();
      };

      req.signal?.addEventListener?.("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no",
    },
  });
}
