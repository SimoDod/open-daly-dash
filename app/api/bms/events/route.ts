export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { BmsEvent, getBmsService } from "@/lib/bms/service";

const DASH_PASS = process.env.DASH_PASS || "1234";

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

  const stream = new ReadableStream({
    start(controller) {
      const write = (obj: BmsEvent) => {
        controller.enqueue(`data: ${JSON.stringify(obj)}\n\n`);
      };

      // initial hello
      write({ ts: new Date().toISOString(), event: "hello" });

      // send last known state
      const snapshot = svc.getLastSnapshot();
      if (snapshot)
        write({ ts: new Date().toISOString(), event: "state", snapshot });

      const onEvt = (evt: BmsEvent) => {
        // Only pass state updates and a few key events downstream
        if (evt?.event === "state" || evt?.event === "connected") {
          write(evt);
        }
      };

      // keepalive pings
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

      // Close on client disconnect (Next handles this automatically); still implement for safety
      req.signal?.addEventListener?.("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
