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
      autoIndex: true,
    });
  }
  global.__mongoose!.conn = await global.__mongoose!.promise;
  return global.__mongoose!.conn;
}

// Schema with bmsId
const BmsSampleSchema = new Schema(
  {
    ts: { type: Date, required: true },
    bmsId: { type: Number, required: true, enum: [1, 2] },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { collection: collName, versionKey: false }
);

// TTL Index: Automatically delete documents 7 days after 'ts'
BmsSampleSchema.index(
  { ts: 1 },
  { expireAfterSeconds: 604800 } // 7 days = 7 * 24 * 60 * 60 = 604800 seconds
);

// Compound index for efficient queries: latest samples per BMS
BmsSampleSchema.index({ bmsId: 1, ts: -1 });

// Optional: regular index on ts for general sorting
BmsSampleSchema.index({ ts: 1 });

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
