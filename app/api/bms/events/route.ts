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
      const write = (obj: BmsEvent) => {
        controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
      };

      // initial hello
      write({ ts: new Date().toISOString(), event: "hello" });

      // seed current status
      const isConnected = (svc as any).getIsConnected?.() ?? false;
      const isReady = (svc as any).getIsReady?.() ?? false;
      write({
        ts: new Date().toISOString(),
        event: isConnected
          ? isReady
            ? "ready"
            : "connected"
          : ("disconnected" as any),
      });

      // send last known state if any
      const snapshot = (svc as any).getLastSnapshot?.();
      if (snapshot) {
        write({
          ts: new Date().toISOString(),
          event: "state",
          snapshot,
        } as any);
      }

      const onEvt = (evt: BmsEvent) => {
        if (debug) {
          write(evt);
          return;
        }
        // Forward key events downstream for UI
        if (
          evt?.event === "state" ||
          evt?.event === "connected" ||
          evt?.event === "ready" ||
          evt?.event === "no_data" ||
          evt?.event === "disconnected" ||
          evt?.event === "tx_error"
        ) {
          write(evt);
        }
      };

      // keepalive pings (some proxies need no-transform to avoid buffering)
      const ping = setInterval(
        () => controller.enqueue(`: keepalive\n\n`),
        15000
      );

      // subscribe
      const listener = (e: BmsEvent) => onEvt(e);
      (
        svc as unknown as {
          on: (evt: string, fn: (e: BmsEvent) => void) => void;
        }
      ).on("evt", listener);

      // teardown
      const close = () => {
        clearInterval(ping);
        (
          svc as unknown as {
            off: (evt: string, fn: (e: BmsEvent) => void) => void;
          }
        ).off("evt", listener);
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
      // Helpful with some proxies that buffer
      "X-Accel-Buffering": "no",
    },
  });
}
