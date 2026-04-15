import { MongoClient, GridFSBucket, type Db } from "mongodb";
import { config } from "../config/index.js";

let client: MongoClient | null = null;
let db: Db | null = null;
let bucket: GridFSBucket | null = null;

export async function connectMongo(): Promise<{ db: Db; bucket: GridFSBucket }> {
  if (client && db && bucket) return { db, bucket };
  try {
    client = new MongoClient(config.MONGO_URL, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
    });
    await client.connect();
    db = client.db(config.MONGO_DB);
    bucket = new GridFSBucket(db, { bucketName: "documents" });
    console.log("[mongo] connected to", config.MONGO_URL, "db=", config.MONGO_DB);
    return { db, bucket };
  } catch (err) {
    console.error("[mongo] connection failed:", (err as Error).message);
    client = null;
    db = null;
    bucket = null;
    throw err;
  }
}

export function getBucket(): GridFSBucket {
  if (!bucket) throw new Error("MongoDB not connected — call connectMongo() first");
  return bucket;
}

export function getDb(): Db {
  if (!db) throw new Error("MongoDB not connected — call connectMongo() first");
  return db;
}

export async function checkMongoHealth(): Promise<boolean> {
  try {
    if (!db) return false;
    const result = await Promise.race([
      db.admin().ping(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 2_000),
      ),
    ]);
    return (result as { ok: number }).ok === 1;
  } catch {
    return false;
  }
}
