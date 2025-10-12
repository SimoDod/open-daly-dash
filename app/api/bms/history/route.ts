export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getBmsSampleModel } from "@/lib/db/mongoose";

const DASH_PASS = process.env.DASH_PASS;

function isAuthed(req: NextRequest) {
  const pass =
    req.nextUrl.searchParams.get("pass") || req.headers.get("x-pass");

  console.log({ pass: req.headers.get("x-pass") });

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

  const u = req.nextUrl;
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  const limit = Math.min(
    parseInt(u.searchParams.get("limit") || "1000", 10),
    5000
  );

  const q: { ts?: { $gte?: Date; $lte?: Date } } = {};
  if (from || to) q.ts = {};
  if (from) {
    if (!q.ts) q.ts = {};
    q.ts.$gte = new Date(from);
  }
  if (to) {
    if (!q.ts) q.ts = {};
    q.ts.$lte = new Date(to);
  }

  const Model = await getBmsSampleModel();
  const docs = await Model.find(q)
    .sort({ ts: 1 })
    .limit(limit)
    .lean()
    .select({ _id: 0 })
    .exec();

  return new Response(JSON.stringify({ count: docs.length, data: docs }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
