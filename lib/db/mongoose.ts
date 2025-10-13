import mongoose, { Schema, InferSchemaType, Model } from "mongoose";

const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "bms";
const collName = process.env.MONGODB_COLLECTION || "bms_samples";

// Cache connection across hot reloads
type GlobalWithMongoose = typeof globalThis & {
  __mongoose?: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
};
declare const global: GlobalWithMongoose;

if (!global.__mongoose) {
  global.__mongoose = { conn: null, promise: null };
}

export async function dbConnect(): Promise<typeof mongoose> {
  if (global.__mongoose!.conn) return global.__mongoose!.conn;
  if (!global.__mongoose!.promise) {
    if (!uri) throw new Error("MONGODB_URI not set");
    global.__mongoose!.promise = mongoose.connect(uri, {
      dbName,
      // autoIndex is convenient in dev; tune for prod if needed
      autoIndex: true,
    });
  }
  global.__mongoose!.conn = await global.__mongoose!.promise;
  return global.__mongoose!.conn;
}

// Define schema WITHOUT index:true on fields to avoid duplicate index warnings.
// We'll declare a single index via schema.index() below (TTL or normal).
const BmsSampleSchema = new Schema(
  {
    ts: { type: Date, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { collection: collName, versionKey: false }
);

// One and only one index on ts:
// - If RETENTION_DAYS set: TTL index
// - Else: normal ascending index
const days = Number(process.env.RETENTION_DAYS || "");
if (Number.isFinite(days) && days > 0) {
  BmsSampleSchema.index(
    { ts: 1 },
    { expireAfterSeconds: Math.round(days * 86400) }
  );
} else {
  BmsSampleSchema.index({ ts: 1 });
}

type BmsSampleDoc = InferSchemaType<typeof BmsSampleSchema>;
let BmsSampleModel: Model<BmsSampleDoc> | null = null;

export async function getBmsSampleModel(): Promise<Model<BmsSampleDoc>> {
  await dbConnect();
  if (!BmsSampleModel) {
    BmsSampleModel =
      mongoose.models.BmsSample ||
      mongoose.model<BmsSampleDoc>("BmsSample", BmsSampleSchema);
  }
  return BmsSampleModel;
}
