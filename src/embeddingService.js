import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Embedding Service using Gemini text-embedding-004
 * Generates vector embeddings for text strings to be stored in Qdrant.
 */

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'gemini-embedding-001';
const EMBEDDING_DIMENSIONS = 768; // text-embedding-004 output dimensions

let _aiClient = null;

function getAIClient() {
  if (!_aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error('GEMINI_API_KEY is required for embedding generation.');
    }
    _aiClient = new GoogleGenAI({ apiKey: key });
  }
  return _aiClient;
}

/**
 * Generate an embedding vector for a single text string with retry logic on 429 rate limit.
 * @param {string} text - The text to embed
 * @param {number} [maxRetries=3]
 * @returns {Promise<number[]>} The embedding vector (768 dimensions)
 */
export async function embedText(text, maxRetries = 3) {
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new Error('Text input is required for embedding.');
  }

  const ai = getAIClient();

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await ai.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text.trim(),
        config: {
          outputDimensionality: EMBEDDING_DIMENSIONS
        }
      });

      if (result && result.embeddings && result.embeddings.length > 0) {
        return result.embeddings[0].values;
      }

      throw new Error('No embedding returned from Gemini.');
    } catch (err) {
      const isRateLimit = err.message?.includes('429') || err.message?.includes('RESOURCE_EXHAUSTED') || err.status === 'RESOURCE_EXHAUSTED';
      if (isRateLimit && attempt < maxRetries) {
        // Wait 15s before retrying when hitting rate limit
        const waitTime = attempt * 12000;
        console.log(`  ⏳ Rate limit encountered. Waiting ${(waitTime / 1000).toFixed(0)}s before retry (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Generate embeddings for a batch of texts with controlled pacing and rate limiting.
 * @param {string[]} texts - Array of texts to embed
 * @param {number} [batchSize=5] - Number of texts per batch
 * @param {number} [delayMs=750] - Delay between batches in milliseconds
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
export async function embedBatch(texts, batchSize = 5, delayMs = 750) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }

  const results = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (text) => {
        try {
          return await embedText(text);
        } catch (err) {
          console.warn(`Embedding failed for text "${text.substring(0, 50)}...": ${err.message}`);
          return null;
        }
      })
    );
    results.push(...batchResults);

    process.stdout.write(`\r  Progress: ${results.length}/${texts.length} embeddings generated...`);

    // Pacing delay between batches
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  process.stdout.write('\n');

  return results;
}

// ─── Rich Text Builders for Each Table ──────────────────────────────────────

/**
 * Build a rich composite text for a Doctor record for embedding.
 * Combines English and Arabic names, position, qualifications, experience, and rating.
 * @param {object} doctor - Doctor record from Parse
 * @returns {string} Composite text for embedding
 */
export function buildDoctorText(doctor) {
  const parts = [];
  if (doctor.fullname) parts.push(doctor.fullname);
  if (doctor.fullnameAr) parts.push(doctor.fullnameAr);
  if (doctor.positionEn) parts.push(doctor.positionEn);
  if (doctor.positionAr) parts.push(doctor.positionAr);
  if (doctor.title) parts.push(doctor.title);
  if (doctor.qualificationsEn) parts.push(doctor.qualificationsEn);
  if (doctor.qualificationsAr) parts.push(doctor.qualificationsAr);
  if (doctor.gender) parts.push(`Gender: ${doctor.gender}`);
  if (doctor.yrsExp) parts.push(`${doctor.yrsExp} years of experience`);
  if (doctor.averageRating) parts.push(`Rating: ${doctor.averageRating}/5`);
  return parts.join(' | ') || 'Doctor';
}

/**
 * Build a rich composite text for a Hospital record for embedding.
 * @param {object} hospital - Hospital record from Parse
 * @returns {string} Composite text for embedding
 */
export function buildHospitalText(hospital) {
  const parts = [];
  if (hospital.nameEn) parts.push(hospital.nameEn);
  if (hospital.nameAr) parts.push(hospital.nameAr);
  if (hospital.hospitalType) parts.push(hospital.hospitalType);
  if (hospital.descEn) parts.push(hospital.descEn);
  if (hospital.descAr) parts.push(hospital.descAr);
  if (hospital.addressEn) parts.push(hospital.addressEn);
  if (hospital.addressAr) parts.push(hospital.addressAr);
  return parts.join(' | ') || 'Hospital';
}

/**
 * Build a rich composite text for a Specialty record for embedding.
 * @param {object} specialty - Specialty record from Parse
 * @returns {string} Composite text for embedding
 */
export function buildSpecialtyText(specialty) {
  const parts = [];
  if (specialty.nameEn) parts.push(specialty.nameEn);
  if (specialty.nameAr) parts.push(specialty.nameAr);
  return parts.join(' | ') || 'Specialty';
}

/**
 * Build a rich composite text for a HospitalDoctorSpecialty record for embedding.
 * Combines doctor name + hospital name + specialty name from expanded pointers.
 * @param {object} hds - HospitalDoctorSpecialty record with expanded pointers
 * @returns {string} Composite text for embedding
 */
export function buildHospitalDoctorSpecialtyText(hds) {
  const parts = [];

  // Doctor details
  const doc = hds.doctorDetails || {};
  if (doc.fullname) parts.push(`Doctor: ${doc.fullname}`);
  if (doc.fullnameAr) parts.push(doc.fullnameAr);
  if (doc.positionEn) parts.push(doc.positionEn);
  if (doc.positionAr) parts.push(doc.positionAr);
  if (doc.qualificationsEn) parts.push(doc.qualificationsEn);
  if (doc.yrsExp) parts.push(`${doc.yrsExp} years experience`);
  if (doc.averageRating) parts.push(`Rating: ${doc.averageRating}/5`);

  // Hospital details
  const hosp = hds.hospitalDetails || {};
  if (hosp.nameEn) parts.push(`Hospital: ${hosp.nameEn}`);
  if (hosp.nameAr) parts.push(hosp.nameAr);
  if (hosp.addressEn) parts.push(hosp.addressEn);
  if (hosp.hospitalType) parts.push(hosp.hospitalType);

  // Specialty details
  const spec = hds.specialtyDetails || {};
  if (spec.nameEn) parts.push(`Specialty: ${spec.nameEn}`);
  if (spec.nameAr) parts.push(spec.nameAr);

  return parts.join(' | ') || 'Hospital-Doctor-Specialty Link';
}

export { EMBEDDING_DIMENSIONS };
