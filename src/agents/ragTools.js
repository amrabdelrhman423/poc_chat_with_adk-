import { FunctionTool } from '@google/adk';
import { semanticSearch, hybridSearch, buildContext } from '../ragService.js';
import { COLLECTIONS } from '../qdrantService.js';

/**
 * RAG FunctionTool definitions for ADK agents.
 * These tools enable semantic and hybrid search across the Qdrant vector database.
 */

/**
 * Creates RAG search tools.
 * @returns {{ semanticSearchTool: FunctionTool, hybridSearchTool: FunctionTool }}
 */
export function createRagTools() {
  const semanticSearchTool = new FunctionTool({
    name: 'rag_semantic_search',
    description: `Search the medical database using natural language semantic search powered by AI embeddings and Qdrant vector database.
This tool finds relevant doctors, hospitals, specialties, and doctor-hospital-specialty relationships using meaning-based search — not just keyword matching.
Use this for general medical queries like "orthopedic surgeon", "best heart doctor", "hospitals with dermatology", "عظام" (bones), "قلب" (heart), etc.
It searches across 4 collections: doctors, hospitals, specialties, and hospital_doctor_specialty (which links doctors to hospitals and specialties).`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The natural language search query. Can be in English, Arabic, or any language. Examples: "orthopedic doctor", "heart specialist", "دكتور عظام", "best rated surgeon", "hospitals in downtown"'
        },
        collections: {
          type: 'string',
          description: 'Comma-separated list of collections to search. Options: "doctors", "hospitals", "specialties", "hospital_doctor_specialty". Leave empty to search all collections. Use "hospital_doctor_specialty" to find doctor-hospital-specialty relationships.'
        },
        topK: {
          type: 'number',
          description: 'Maximum number of results to return per collection (default: 10, max: 20)'
        }
      },
      required: ['query']
    },
    execute: async ({ query, collections, topK = 10 }) => {
      try {
        // Parse collections parameter
        let targetCollections = null;
        if (collections && typeof collections === 'string' && collections.trim()) {
          targetCollections = collections.split(',').map(c => c.trim()).filter(c => Object.values(COLLECTIONS).includes(c));
          if (targetCollections.length === 0) targetCollections = null;
        }

        const safeTopK = Math.min(Math.max(topK || 10, 1), 20);
        const results = await semanticSearch(query, targetCollections, safeTopK);
        const context = buildContext(results);

        // Count total hits
        const totalHits = Object.values(results).reduce((sum, hits) => sum + hits.length, 0);

        // Build detailed results for the agent
        const detailedResults = {};
        for (const [collection, hits] of Object.entries(results)) {
          detailedResults[collection] = hits.map(h => ({
            score: h.score,
            ...h.payload
          }));
        }

        return {
          status: 'success',
          query,
          totalHits,
          results: detailedResults,
          context,
          message: `Semantic search for "${query}" found ${totalHits} relevant result(s) across ${Object.keys(results).filter(k => results[k].length > 0).length} collection(s).`
        };
      } catch (err) {
        return { status: 'error', message: `RAG semantic search failed: ${err.message}` };
      }
    }
  });

  const hybridSearchTool = new FunctionTool({
    name: 'rag_hybrid_search',
    description: `Search the medical database using HYBRID search: combines AI semantic understanding with structured filters.
Use this when the user wants to find records matching both a natural language description AND specific criteria like rating, gender, specialty type, hospital type, etc.
For example: "best rated female orthopedic surgeon" → semantic query "orthopedic surgeon" + filter { gender: "female", averageRating: { min: 4 } }.`,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The natural language search query for semantic matching'
        },
        collections: {
          type: 'string',
          description: 'Comma-separated collections to search. Options: "doctors", "hospitals", "specialties", "hospital_doctor_specialty". Leave empty for all.'
        },
        filters: {
          type: 'string',
          description: `JSON string of structured filters to apply alongside semantic search. Filter keys depend on the collection:
- doctors: { "gender": "male/female", "averageRating": {"min": 4}, "yrsExp": {"min": 5} }
- hospitals: { "hospitalType": "clinic/hospital", "areaId": "<area_id>" }
- specialties: { "nameEn": "Cardiology" }
- hospital_doctor_specialty: { "specialtyName": "Orthopedics", "hospitalType": "hospital", "doctorGender": "female" }`
        },
        topK: {
          type: 'number',
          description: 'Maximum number of results per collection (default: 10, max: 20)'
        }
      },
      required: ['query']
    },
    execute: async ({ query, collections, filters, topK = 10 }) => {
      try {
        // Parse collections
        let targetCollections = null;
        if (collections && typeof collections === 'string' && collections.trim()) {
          targetCollections = collections.split(',').map(c => c.trim()).filter(c => Object.values(COLLECTIONS).includes(c));
          if (targetCollections.length === 0) targetCollections = null;
        }

        // Parse filters
        let parsedFilters = {};
        if (filters) {
          if (typeof filters === 'object') {
            parsedFilters = filters;
          } else if (typeof filters === 'string' && filters.trim()) {
            try { parsedFilters = JSON.parse(filters); } catch (e) {
              return { status: 'error', message: `Invalid filters JSON: ${e.message}` };
            }
          }
        }

        const safeTopK = Math.min(Math.max(topK || 10, 1), 20);
        const results = await hybridSearch(query, targetCollections, parsedFilters, safeTopK);
        const context = buildContext(results);

        const totalHits = Object.values(results).reduce((sum, hits) => sum + hits.length, 0);

        const detailedResults = {};
        for (const [collection, hits] of Object.entries(results)) {
          detailedResults[collection] = hits.map(h => ({
            score: h.score,
            ...h.payload
          }));
        }

        return {
          status: 'success',
          query,
          filters: parsedFilters,
          totalHits,
          results: detailedResults,
          context,
          message: `Hybrid search for "${query}" with filters found ${totalHits} relevant result(s).`
        };
      } catch (err) {
        return { status: 'error', message: `RAG hybrid search failed: ${err.message}` };
      }
    }
  });

  return { semanticSearchTool, hybridSearchTool };
}
