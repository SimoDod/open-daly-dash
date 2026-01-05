// app/api/bms/route.ts (or your current endpoint file)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getBmsService } from "@/lib/bms/service";

const DASH_PASS = process.env.DASH_PASS;

function isAuthed(req: NextRequest) {
  const pass =
    req.nextUrl.searchParams.get("pass") || req.headers.get("x-pass");
  return pass && pass === DASH_PASS;
}

export async function GET(req: NextRequest) {
  if (!isAuthed(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  const svc = getBmsService();
  await svc.ensureStarted();

  // New: Return data for BOTH BMS 1 and BMS 2
  const status = {
    ts: new Date().toISOString(),
    bms: {
      1: {
        connected: svc.getIsConnected(1),
        ready: svc.getIsReady(1),
        device: svc.getDeviceInfo(1),
        snapshot: svc.getLastSnapshot(1),
      },
      2: {
        connected: svc.getIsConnected(2),
        ready: svc.getIsReady(2),
        device: svc.getDeviceInfo(2),
        snapshot: svc.getLastSnapshot(2),
      },
    },
  };

  return new Response(JSON.stringify(status), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
