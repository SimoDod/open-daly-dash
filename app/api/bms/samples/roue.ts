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

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") || "1000"),
    5000
  );
  const Model = await getBmsSampleModel();
  const docs = await Model.find()
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
