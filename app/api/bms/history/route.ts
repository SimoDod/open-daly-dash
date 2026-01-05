// app/api/history/route.ts (or your history endpoint file)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { getBmsSampleModel } from "@/lib/db/mongoose";

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

  const u = req.nextUrl;

  // Optional filters
  const from = u.searchParams.get("from");
  const to = u.searchParams.get("to");
  const bmsIdParam = u.searchParams.get("bmsId"); // ?bmsId=1 or ?bmsId=2 or none
  const limitParam = u.searchParams.get("limit");

  const bmsId = bmsIdParam ? Number(bmsIdParam) : undefined;
  if (bmsId !== undefined && ![1, 2].includes(bmsId)) {
    return new Response(JSON.stringify({ error: "bmsId must be 1 or 2" }), {
      status: 400,
    });
  }

  const limit = limitParam ? Math.min(Number(limitParam), 20000) : 10000;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: any = {};

  // Time range
  if (from || to) {
    query.ts = {};
    if (from) query.ts.$gte = new Date(from);
    if (to) query.ts.$lte = new Date(to);
  }

  // BMS filter
  if (bmsId !== undefined) {
    query.bmsId = bmsId;
  }

  const Model = await getBmsSampleModel();

  const docs = await Model.find(query)
    .sort({ ts: 1 })
    .limit(limit)
    .lean()
    .select({ _id: 0, __v: 0 }) // exclude Mongo internals
    .exec();

  // Optional: group by bmsId for easier frontend handling
  const grouped = docs.reduce((acc, doc) => {
    const id = doc.bmsId ?? "unknown";
    if (!acc[id]) acc[id] = [];
    acc[id].push(doc);
    return acc;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as Record<string, any[]>);

  return new Response(
    JSON.stringify({
      ts: new Date().toISOString(),
      count: docs.length,
      filters: { from, to, bmsId, limit },
      // Choose one format:
      // data: docs,                    // flat list (original style)
      data: grouped, // grouped by bmsId — RECOMMENDED
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
