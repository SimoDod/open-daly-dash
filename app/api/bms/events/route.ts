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

  const stream = new ReadableStream({
    start(controller) {
      const write = (obj: any) => {
        controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
      };

      // Initial hello (kept for legacy clients)
      write({ ts: new Date().toISOString(), event: "hello" });

      // Send current status for BOTH BMS 1 and 2
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
            device,
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
        }
      });

      // Event forwarder
      const onEvt = (evt: BmsEvent) => {
        if (debug) {
          write(evt);
          return;
        }

        // Forward relevant events (now with bmsId included)
        if (
          evt.event === "state" ||
          evt.event === "connected" ||
          evt.event === "ready" ||
          evt.event === "no_data" ||
          evt.event === "disconnected" ||
          evt.event === "tx_error"
        ) {
          write(evt);
        }
      };

      // Keepalive pings every 15s
      const ping = setInterval(() => {
        controller.enqueue(`: keepalive\n\n`);
      }, 45000);

      // Subscribe to all events
      svc.on("evt", onEvt);

      // Cleanup on client disconnect
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
      "X-Accel-Buffering": "no", // Important for nginx/proxy
    },
  });
}
