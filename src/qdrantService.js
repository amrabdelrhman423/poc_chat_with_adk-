import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import { EMBEDDING_DIMENSIONS } from './embeddingService.js';

dotenv.config();

/**
 * Qdrant Vector Database Service
 * Manages collections, upserting vectors, and performing semantic / hybrid search.
 */

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY || undefined;

// Collection names matching the 4 Parse tables
export const COLLECTIONS = {
  DOCTORS: 'doctors',
  HOSPITALS: 'hospitals',
  SPECIALTIES: 'specialties',
  HOSPITAL_DOCTOR_SPECIALTY: 'hospital_doctor_specialty'
};

let _client = null;

/**
 * Get or create the Qdrant client singleton.
 * @returns {QdrantClient}
 */
export function getQdrantClient() {
  if (!_client) {
    const config = { url: QDRANT_URL, checkCompatibility: false };
    if (QDRANT_API_KEY) {
      config.apiKey = QDRANT_API_KEY;
    }
    _client = new QdrantClient(config);
  }
  return _client;
}

/**
 * Check if Qdrant is reachable.
 * @returns {Promise<{connected: boolean, error?: string}>}
 */
export async function checkQdrantConnection() {
  try {
    const client = getQdrantClient();
    const result = await client.getCollections();
    return { connected: true, collections: result.collections.map(c => c.name) };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

/**
 * Ensure all 4 collections exist in Qdrant with the correct vector configuration.
 * Creates collections that don't exist yet; skips existing ones.
 */
export async function ensureCollections() {
  const client = getQdrantClient();
  const existingResult = await client.getCollections();
  const existingNames = new Set(existingResult.collections.map(c => c.name));

  for (const collectionName of Object.values(COLLECTIONS)) {
    if (existingNames.has(collectionName)) {
      console.log(`  ✓ Collection "${collectionName}" already exists.`);
      continue;
    }

    await client.createCollection(collectionName, {
      vectors: {
        size: EMBEDDING_DIMENSIONS,
        distance: 'Cosine'
      },
      // Enable payload indexing for hybrid search filters
      optimizers_config: {
        default_segment_number: 2
      }
    });

    // Create payload indexes for frequently filtered fields
    const indexFields = getPayloadIndexFields(collectionName);
    for (const field of indexFields) {
      try {
        await client.createPayloadIndex(collectionName, {
          field_name: field.name,
          field_schema: field.type
        });
      } catch (err) {
        console.warn(`  ⚠ Could not create index on ${collectionName}.${field.name}: ${err.message}`);
      }
    }

    console.log(`  ✅ Created collection "${collectionName}" with ${EMBEDDING_DIMENSIONS}-dim Cosine vectors.`);
  }
}

/**
 * Get payload index fields for a collection (used for hybrid search filtering).
 */
function getPayloadIndexFields(collectionName) {
  switch (collectionName) {
    case COLLECTIONS.DOCTORS:
      return [
        { name: 'objectId', type: 'keyword' },
        { name: 'uid', type: 'keyword' },
        { name: 'gender', type: 'keyword' },
        { name: 'yrsExp', type: 'integer' },
        { name: 'averageRating', type: 'float' },
        { name: 'fullname', type: 'text' },
        { name: 'fullnameAr', type: 'text' }
      ];
    case COLLECTIONS.HOSPITALS:
      return [
        { name: 'objectId', type: 'keyword' },
        { name: 'uid', type: 'keyword' },
        { name: 'hospitalType', type: 'keyword' },
        { name: 'nameEn', type: 'text' },
        { name: 'nameAr', type: 'text' },
        { name: 'areaId', type: 'keyword' }
      ];
    case COLLECTIONS.SPECIALTIES:
      return [
        { name: 'objectId', type: 'keyword' },
        { name: 'nameEn', type: 'text' },
        { name: 'nameAr', type: 'text' }
      ];
    case COLLECTIONS.HOSPITAL_DOCTOR_SPECIALTY:
      return [
        { name: 'objectId', type: 'keyword' },
        { name: 'hospitalUid', type: 'keyword' },
        { name: 'doctorUid', type: 'keyword' },
        { name: 'specialtyUid', type: 'keyword' },
        { name: 'doctorName', type: 'text' },
        { name: 'hospitalName', type: 'text' },
        { name: 'specialtyName', type: 'text' }
      ];
    default:
      return [];
  }
}

/**
 * Upsert points (vectors + payloads) into a Qdrant collection.
 * @param {string} collectionName - Name of the collection
 * @param {Array<{id: string|number, vector: number[], payload: object}>} points - Points to upsert
 * @param {number} [batchSize=100] - Number of points per batch
 */
export async function upsertPoints(collectionName, points, batchSize = 100) {
  if (!points || points.length === 0) return;

  const client = getQdrantClient();

  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await client.upsert(collectionName, {
      wait: true,
      points: batch
    });
  }
}

/**
 * Semantic vector search in a Qdrant collection.
 * @param {string} collectionName - Collection to search
 * @param {number[]} queryVector - The query embedding vector
 * @param {number} [topK=10] - Number of results to return
 * @param {object} [filter=null] - Optional Qdrant filter for hybrid search
 * @returns {Promise<Array<{id: string, score: number, payload: object}>>}
 */
export async function searchSimilar(collectionName, queryVector, topK = 10, filter = null) {
  const client = getQdrantClient();

  const searchParams = {
    limit: topK,
    with_payload: true
  };

  if (filter) {
    searchParams.filter = filter;
  }

  let rawResults = [];

  // @qdrant/js-client-rest v1.19+ uses client.query()
  if (typeof client.query === 'function') {
    const res = await client.query(collectionName, {
      query: queryVector,
      ...searchParams
    });
    rawResults = res?.points || [];
  } else if (typeof client.search === 'function') {
    // Legacy method fallback
    rawResults = await client.search(collectionName, {
      vector: queryVector,
      ...searchParams
    });
  }

  return rawResults.map(r => ({
    id: r.id,
    score: r.score,
    payload: r.payload
  }));
}

/**
 * Hybrid search: combines semantic vector similarity with Qdrant payload filters.
 * @param {string} collectionName - Collection to search
 * @param {number[]} queryVector - The query embedding vector
 * @param {object} filters - Structured filter conditions
 * @param {number} [topK=10] - Number of results
 * @returns {Promise<Array<{id: string, score: number, payload: object}>>}
 */
export async function hybridSearch(collectionName, queryVector, filters = {}, topK = 10) {
  // Build Qdrant filter from structured conditions
  const qdrantFilter = buildQdrantFilter(filters);
  return searchSimilar(collectionName, queryVector, topK, qdrantFilter);
}

/**
 * Build a Qdrant filter object from structured filter conditions.
 * Supports: keyword match, numeric range, text match, boolean.
 * @param {object} filters - Key-value filter conditions
 * @returns {object|null} Qdrant filter object or null
 */
function buildQdrantFilter(filters) {
  if (!filters || Object.keys(filters).length === 0) return null;

  const must = [];

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      // Range filter: { min: 3, max: 5 }
      if (value.min !== undefined || value.max !== undefined) {
        const rangeCondition = { key };
        const range = {};
        if (value.min !== undefined) range.gte = value.min;
        if (value.max !== undefined) range.lte = value.max;
        must.push({ key, range });
      }
      // Match any from list: { any: ["cardiology", "dermatology"] }
      if (value.any && Array.isArray(value.any)) {
        must.push({
          key,
          match: { any: value.any }
        });
      }
    } else if (typeof value === 'string') {
      // Text/keyword match
      must.push({
        key,
        match: { value }
      });
    } else if (typeof value === 'number') {
      // Exact numeric match
      must.push({
        key,
        match: { value }
      });
    } else if (typeof value === 'boolean') {
      must.push({
        key,
        match: { value }
      });
    }
  }

  if (must.length === 0) return null;
  return { must };
}

/**
 * Get collection info (point count, status).
 * @param {string} collectionName
 * @returns {Promise<{name: string, pointCount: number, status: string}>}
 */
export async function getCollectionInfo(collectionName) {
  try {
    const client = getQdrantClient();
    const info = await client.getCollection(collectionName);
    return {
      name: collectionName,
      pointCount: info.points_count || 0,
      status: info.status || 'unknown',
      vectorSize: info.config?.params?.vectors?.size || EMBEDDING_DIMENSIONS
    };
  } catch (err) {
    return { name: collectionName, pointCount: 0, status: 'not_found', error: err.message };
  }
}

/**
 * Get status of all RAG collections.
 * @returns {Promise<object>}
 */
export async function getAllCollectionsStatus() {
  const statuses = {};
  for (const [key, name] of Object.entries(COLLECTIONS)) {
    statuses[key] = await getCollectionInfo(name);
  }
  return statuses;
}

/**
 * Delete a collection (for re-sync).
 * @param {string} collectionName
 */
export async function deleteCollection(collectionName) {
  try {
    const client = getQdrantClient();
    await client.deleteCollection(collectionName);
    console.log(`  🗑️ Deleted collection "${collectionName}".`);
  } catch (err) {
    console.warn(`  ⚠ Could not delete collection "${collectionName}": ${err.message}`);
  }
}

/**
 * Delete all RAG collections (for full re-sync).
 */
export async function deleteAllCollections() {
  for (const name of Object.values(COLLECTIONS)) {
    await deleteCollection(name);
  }
}
