import crypto from 'crypto';
import dotenv from 'dotenv';
import {
  embedText,
  embedBatch,
  buildDoctorText,
  buildHospitalText,
  buildSpecialtyText,
  buildHospitalDoctorSpecialtyText
} from './embeddingService.js';
import {
  COLLECTIONS,
  ensureCollections,
  upsertPoints,
  searchSimilar,
  hybridSearch as qdrantHybridSearch,
  getAllCollectionsStatus,
  deleteAllCollections
} from './qdrantService.js';
import { queryParseClass } from './parseService.js';

dotenv.config();

/**
 * RAG (Retrieval-Augmented Generation) Service
 * Orchestrates sync from Parse → Qdrant and semantic/hybrid search.
 */

// ─── SYNC FUNCTIONS ─────────────────────────────────────────────────────────

/**
 * Fetch all records from a Parse class (paginated, handles > 100 records).
 * @param {string} className - Parse class name
 * @param {object} [options] - Additional query options (include, keys, where)
 * @returns {Promise<object[]>} All records
 */
async function fetchAllParseRecords(className, options = {}) {
  const allRecords = [];
  const pageSize = 100;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const result = await queryParseClass(className, {
      where: options.where || { isDeleted: { $ne: true } },
      limit: pageSize,
      skip,
      include: options.include || undefined,
      keys: options.keys || undefined,
      order: 'createdAt'
    });

    allRecords.push(...result.results);
    skip += pageSize;
    hasMore = result.results.length === pageSize;
  }

  return allRecords;
}

/**
 * Sync Doctors table from Parse → Qdrant.
 * @returns {Promise<{synced: number, errors: number}>}
 */
export async function syncDoctors() {
  console.log('\n📋 Syncing Doctors...');
  const records = await fetchAllParseRecords('Doctors');
  console.log(`  Fetched ${records.length} doctor records from Parse.`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  // Build text representations for embedding
  const texts = records.map(r => buildDoctorText(r));
  console.log(`  Generating embeddings for ${texts.length} doctors...`);
  const embeddings = await embedBatch(texts);

  // Build Qdrant points
  const points = [];
  let errors = 0;

  for (let i = 0; i < records.length; i++) {
    const vector = embeddings[i];
    if (!vector) {
      errors++;
      continue;
    }

    const doc = records[i];
    points.push({
      id: generatePointId(doc.objectId),
      vector,
      payload: {
        objectId: doc.objectId,
        uid: doc.uid || '',
        fullname: doc.fullname || '',
        fullnameAr: doc.fullnameAr || '',
        title: doc.title || '',
        positionEn: doc.positionEn || '',
        positionAr: doc.positionAr || '',
        qualificationsEn: doc.qualificationsEn || '',
        qualificationsAr: doc.qualificationsAr || '',
        gender: doc.gender || '',
        yrsExp: doc.yrsExp || 0,
        averageRating: doc.averageRating || 0,
        email: doc.email || '',
        phonenumber: doc.phonenumber || '',
        profileUrl: doc.profileUrl || '',
        rank: doc.rank || 0,
        embeddingText: texts[i]
      }
    });
  }

  if (points.length > 0) {
    await upsertPoints(COLLECTIONS.DOCTORS, points);
  }

  console.log(`  ✅ Synced ${points.length} doctors to Qdrant (${errors} errors).`);
  return { synced: points.length, errors };
}

/**
 * Sync Hospitals table from Parse → Qdrant.
 */
export async function syncHospitals() {
  console.log('\n🏥 Syncing Hospitals...');
  const records = await fetchAllParseRecords('Hospitals');
  console.log(`  Fetched ${records.length} hospital records from Parse.`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  const texts = records.map(r => buildHospitalText(r));
  console.log(`  Generating embeddings for ${texts.length} hospitals...`);
  const embeddings = await embedBatch(texts);

  const points = [];
  let errors = 0;

  for (let i = 0; i < records.length; i++) {
    const vector = embeddings[i];
    if (!vector) {
      errors++;
      continue;
    }

    const hosp = records[i];
    points.push({
      id: generatePointId(hosp.objectId),
      vector,
      payload: {
        objectId: hosp.objectId,
        uid: hosp.uid || '',
        nameEn: hosp.nameEn || '',
        nameAr: hosp.nameAr || '',
        hospitalType: hosp.hospitalType || '',
        descEn: hosp.descEn || '',
        descAr: hosp.descAr || '',
        addressEn: hosp.addressEn || '',
        addressAr: hosp.addressAr || '',
        longitude: hosp.longitude || 0,
        latitude: hosp.latitude || 0,
        areaId: hosp.areaId || '',
        profileUrl: hosp.profileUrl || '',
        rank: hosp.rank || 0,
        workingDaysHrs: hosp.workingDaysHrs || 0,
        embeddingText: texts[i]
      }
    });
  }

  if (points.length > 0) {
    await upsertPoints(COLLECTIONS.HOSPITALS, points);
  }

  console.log(`  ✅ Synced ${points.length} hospitals to Qdrant (${errors} errors).`);
  return { synced: points.length, errors };
}

/**
 * Sync Specialties table from Parse → Qdrant.
 */
export async function syncSpecialties() {
  console.log('\n🩺 Syncing Specialties...');
  const records = await fetchAllParseRecords('Specialties');
  console.log(`  Fetched ${records.length} specialty records from Parse.`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  const texts = records.map(r => buildSpecialtyText(r));
  console.log(`  Generating embeddings for ${texts.length} specialties...`);
  const embeddings = await embedBatch(texts);

  const points = [];
  let errors = 0;

  for (let i = 0; i < records.length; i++) {
    const vector = embeddings[i];
    if (!vector) {
      errors++;
      continue;
    }

    const spec = records[i];
    points.push({
      id: generatePointId(spec.objectId),
      vector,
      payload: {
        objectId: spec.objectId,
        nameEn: spec.nameEn || '',
        nameAr: spec.nameAr || '',
        imageUrl: spec.imageUrl || '',
        embeddingText: texts[i]
      }
    });
  }

  if (points.length > 0) {
    await upsertPoints(COLLECTIONS.SPECIALTIES, points);
  }

  console.log(`  ✅ Synced ${points.length} specialties to Qdrant (${errors} errors).`);
  return { synced: points.length, errors };
}

/**
 * Sync HospitalDoctorSpecialty table from Parse → Qdrant.
 * This is the key relationship table — includes expanded pointers for rich composite text.
 */
export async function syncHospitalDoctorSpecialty() {
  console.log('\n🔗 Syncing HospitalDoctorSpecialty...');
  const records = await fetchAllParseRecords('HospitalDoctorSpecialty', {
    include: 'doctorDetails,hospitalDetails,specialtyDetails'
  });
  console.log(`  Fetched ${records.length} HDS records from Parse.`);

  if (records.length === 0) return { synced: 0, errors: 0 };

  const texts = records.map(r => buildHospitalDoctorSpecialtyText(r));
  console.log(`  Generating embeddings for ${texts.length} HDS records...`);
  const embeddings = await embedBatch(texts);

  const points = [];
  let errors = 0;

  for (let i = 0; i < records.length; i++) {
    const vector = embeddings[i];
    if (!vector) {
      errors++;
      continue;
    }

    const hds = records[i];
    const doc = hds.doctorDetails || {};
    const hosp = hds.hospitalDetails || {};
    const spec = hds.specialtyDetails || {};

    points.push({
      id: generatePointId(hds.objectId),
      vector,
      payload: {
        objectId: hds.objectId,
        hospitalUid: hds.hospitalUid || '',
        doctorUid: hds.doctorUid || '',
        specialtyUid: hds.specialtyUid || '',
        // Denormalized doctor fields
        doctorName: doc.fullname || '',
        doctorNameAr: doc.fullnameAr || '',
        doctorPosition: doc.positionEn || '',
        doctorPositionAr: doc.positionAr || '',
        doctorRating: doc.averageRating || 0,
        doctorYrsExp: doc.yrsExp || 0,
        doctorGender: doc.gender || '',
        doctorPhone: doc.phonenumber || '',
        doctorProfileUrl: doc.profileUrl || '',
        doctorQualifications: doc.qualificationsEn || '',
        // Denormalized hospital fields
        hospitalName: hosp.nameEn || '',
        hospitalNameAr: hosp.nameAr || '',
        hospitalType: hosp.hospitalType || '',
        hospitalAddress: hosp.addressEn || '',
        hospitalAddressAr: hosp.addressAr || '',
        // Denormalized specialty fields
        specialtyName: spec.nameEn || '',
        specialtyNameAr: spec.nameAr || '',
        embeddingText: texts[i]
      }
    });
  }

  if (points.length > 0) {
    await upsertPoints(COLLECTIONS.HOSPITAL_DOCTOR_SPECIALTY, points);
  }

  console.log(`  ✅ Synced ${points.length} HDS records to Qdrant (${errors} errors).`);
  return { synced: points.length, errors };
}

/**
 * Sync ALL 4 tables from Parse → Qdrant.
 * @param {boolean} [fullResync=false] - If true, delete all collections first
 * @returns {Promise<object>} Sync results for each table
 */
export async function syncAllCollections(fullResync = false) {
  console.log('=======================================================');
  console.log('🚀 Starting RAG Sync: Parse → Qdrant');
  console.log('=======================================================');

  if (fullResync) {
    console.log('\n🗑️ Full resync requested — deleting all collections...');
    await deleteAllCollections();
  }

  // Ensure collections exist
  console.log('\n📦 Ensuring Qdrant collections...');
  await ensureCollections();

  const startTime = Date.now();

  const results = {
    doctors: await syncDoctors(),
    hospitals: await syncHospitals(),
    specialties: await syncSpecialties(),
    hospitalDoctorSpecialty: await syncHospitalDoctorSpecialty()
  };

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const totalSynced = Object.values(results).reduce((sum, r) => sum + r.synced, 0);
  const totalErrors = Object.values(results).reduce((sum, r) => sum + r.errors, 0);

  console.log('\n=======================================================');
  console.log(`✅ RAG Sync Complete! ${totalSynced} records synced in ${elapsed}s (${totalErrors} errors)`);
  console.log('=======================================================\n');

  return { ...results, totalSynced, totalErrors, elapsedSeconds: parseFloat(elapsed) };
}

// ─── SEARCH FUNCTIONS ───────────────────────────────────────────────────────

/**
 * Semantic search across one or more Qdrant collections.
 * @param {string} query - Natural language query
 * @param {string[]} [collections] - Collections to search (defaults to all)
 * @param {number} [topK=10] - Results per collection
 * @returns {Promise<object>} Search results grouped by collection
 */
export async function semanticSearch(query, collections = null, topK = 10) {
  const queryVector = await embedText(query);
  const targetCollections = collections || Object.values(COLLECTIONS);

  const results = {};
  for (const collectionName of targetCollections) {
    try {
      const hits = await searchSimilar(collectionName, queryVector, topK);
      results[collectionName] = hits;
    } catch (err) {
      console.warn(`Semantic search failed in "${collectionName}": ${err.message}`);
      results[collectionName] = [];
    }
  }

  return results;
}

/**
 * Hybrid search: semantic similarity + structured filters.
 * @param {string} query - Natural language query
 * @param {string[]} [collections] - Collections to search
 * @param {object} [filters] - Structured filters per collection
 * @param {number} [topK=10] - Results per collection
 * @returns {Promise<object>} Filtered search results grouped by collection
 */
export async function hybridSearch(query, collections = null, filters = {}, topK = 10) {
  const queryVector = await embedText(query);
  const targetCollections = collections || Object.values(COLLECTIONS);

  const results = {};
  for (const collectionName of targetCollections) {
    try {
      const collectionFilters = filters[collectionName] || filters;
      const hits = await qdrantHybridSearch(collectionName, queryVector, collectionFilters, topK);
      results[collectionName] = hits;
    } catch (err) {
      console.warn(`Hybrid search failed in "${collectionName}": ${err.message}`);
      results[collectionName] = [];
    }
  }

  return results;
}

/**
 * Build a rich context string from search results for LLM consumption,
 * sorted strictly from highest relevance score to lowest.
 * @param {object} searchResults - Results grouped by collection
 * @returns {string} Formatted context string ordered by top score
 */
export function buildContext(searchResults) {
  // Flatten all hits across collections into a single ranked list
  const allHits = [];
  for (const [collection, hits] of Object.entries(searchResults)) {
    if (!hits || !Array.isArray(hits)) continue;
    for (const hit of hits) {
      allHits.push({
        collection,
        score: hit.score,
        payload: hit.payload
      });
    }
  }

  if (allHits.length === 0) {
    return 'No relevant records found in the database.';
  }

  // Sort strictly by relevance score descending (highest score first)
  allHits.sort((a, b) => (b.score || 0) - (a.score || 0));

  const contextParts = [];
  contextParts.push(`\n## 🎯 Top Ranked Search Results (Sorted by Highest Score)\n`);

  allHits.forEach((hit, idx) => {
    const p = hit.payload || {};
    const scorePct = ((hit.score || 0) * 100).toFixed(1);
    const rankBadge = idx === 0 ? '🥇 **[TOP MATCH / النتيجة الأولى' : idx === 1 ? '🥈 **[Rank #2' : idx === 2 ? '🥉 **[Rank #3' : `**[Rank #${idx + 1}`;

    let record = `${rankBadge} — Score: ${scorePct}% | Collection: ${hit.collection}]**\n`;

    switch (hit.collection) {
      case COLLECTIONS.DOCTORS:
        record += `👨‍⚕️ **${p.fullname || 'Unknown'}** ${p.fullnameAr ? `(${p.fullnameAr})` : ''}\n`;
        if (p.positionEn || p.positionAr) record += `  - 🩺 Title / اللقب: ${p.positionEn || p.title || ''}${p.positionAr ? ` / ${p.positionAr}` : ''}\n`;
        if (p.qualificationsEn) record += `  - 🎓 Qualifications: ${p.qualificationsEn}\n`;
        if (p.qualificationsAr) record += `  - 🎓 المؤهلات: ${p.qualificationsAr}\n`;
        if (p.yrsExp) record += `  - ⏳ Experience: ${p.yrsExp} years (${p.yrsExp} سنة خبرة)\n`;
        if (p.averageRating) record += `  - ⭐ Rating: ${p.averageRating}/5\n`;
        if (p.gender) record += `  - 👤 Gender: ${p.gender}\n`;
        if (p.phonenumber) record += `  - 📞 Phone: ${p.phonenumber}\n`;
        if (p.email) record += `  - ✉️ Email: ${p.email}\n`;
        break;

      case COLLECTIONS.HOSPITALS:
        record += `🏥 **${p.nameEn || 'Unknown'}** ${p.nameAr ? `(${p.nameAr})` : ''}\n`;
        if (p.hospitalType) record += `  - 🏷️ Type: ${p.hospitalType}\n`;
        if (p.descEn || p.descAr) record += `  - 📝 Description: ${p.descEn || p.descAr}\n`;
        if (p.addressEn || p.addressAr) record += `  - 📍 Address: ${p.addressEn || ''}${p.addressAr ? ` / ${p.addressAr}` : ''}\n`;
        if (p.workingDaysHrs) record += `  - 🕒 Working Hours: ${p.workingDaysHrs}\n`;
        break;

      case COLLECTIONS.SPECIALTIES:
        record += `🩺 **${p.nameEn || 'Unknown'}** ${p.nameAr ? `(${p.nameAr})` : ''}\n`;
        break;

      case COLLECTIONS.HOSPITAL_DOCTOR_SPECIALTY:
        record += `🔗 **${p.doctorName || 'Unknown Doctor'}** ${p.doctorNameAr ? `(${p.doctorNameAr})` : ''} at **${p.hospitalName || 'Unknown Hospital'}** — ${p.specialtyName || ''} ${p.specialtyNameAr ? `(${p.specialtyNameAr})` : ''}\n`;
        if (p.doctorPosition || p.doctorPositionAr) record += `  - 🩺 Title: ${p.doctorPosition || ''}${p.doctorPositionAr ? ` / ${p.doctorPositionAr}` : ''}\n`;
        if (p.doctorRating) record += `  - ⭐ Rating: ${p.doctorRating}/5\n`;
        if (p.doctorYrsExp) record += `  - ⏳ Experience: ${p.doctorYrsExp} years\n`;
        if (p.hospitalAddress || p.hospitalAddressAr) record += `  - 📍 Hospital Address: ${p.hospitalAddress || ''}${p.hospitalAddressAr ? ` / ${p.hospitalAddressAr}` : ''}\n`;
        if (p.doctorPhone) record += `  - 📞 Phone: ${p.doctorPhone}\n`;
        if (p.doctorEmail) record += `  - ✉️ Email: ${p.doctorEmail}\n`;
        if (p.doctorQualifications) record += `  - 🎓 Qualifications: ${p.doctorQualifications}\n`;
        break;
    }

    contextParts.push(record);
  });

  return contextParts.join('\n\n') || 'No relevant records found in the database.';
}

/**
 * Get RAG system status.
 * @returns {Promise<object>}
 */
export async function getRagStatus() {
  const collections = await getAllCollectionsStatus();
  return {
    status: 'ready',
    collections,
    totalPoints: Object.values(collections).reduce((sum, c) => sum + (c.pointCount || 0), 0)
  };
}

// ─── UTILITIES ──────────────────────────────────────────────────────────────

/**
 * Generate a deterministic UUID point ID from a Parse objectId string.
 * Qdrant accepts UUID strings as point IDs, which avoids numeric collisions.
 * Uses MD5 hash of the objectId formatted as a UUID v3-style string.
 * @param {string} objectId - Parse objectId
 * @returns {string} Deterministic UUID string
 */
function generatePointId(objectId) {
  const hash = crypto.createHash('md5').update(objectId).digest('hex');
  // Format as UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
}

