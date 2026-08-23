import { and, eq } from "drizzle-orm";
import { sourceCollections, sources } from "../../../drizzle/schema";
import { getDb } from "../../db";

/**
 * Access-policy boundary for source governance.
 *
 * Keep owner filtering at this boundary so callers never receive a source or
 * collection before its tenant/workspace ownership has been established.
 */
export async function requireOwnedSource(ownerId: number, sourceId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const source = (await db.select().from(sources).where(and(eq(sources.id, sourceId), eq(sources.ownerId, ownerId))).limit(1))[0];
  if (!source) throw new Error("Source not found.");
  return source;
}

/** Access-policy boundary for collections used by source and alert governance. */
export async function requireOwnedCollection(ownerId: number, collectionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const collection = (await db.select().from(sourceCollections).where(and(eq(sourceCollections.id, collectionId), eq(sourceCollections.ownerId, ownerId))).limit(1))[0];
  if (!collection) throw new Error("Collection not found.");
  return collection;
}
