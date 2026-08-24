#!/usr/bin/env node

/**
 * Standalone Qdrant Sync Script
 * Syncs all 4 Parse tables (Doctors, Hospitals, Specialties, HospitalDoctorSpecialty)
 * to Qdrant vector database with Gemini text-embedding-004 embeddings.
 *
 * Usage:
 *   node src/syncQdrant.js            # Incremental sync (upserts)
 *   node src/syncQdrant.js --full      # Full resync (deletes all collections first)
 *   node src/syncQdrant.js --status    # Show collection status only
 */

import dotenv from 'dotenv';
import { syncAllCollections, getRagStatus } from './ragService.js';
import { checkQdrantConnection } from './qdrantService.js';

dotenv.config();

async function main() {
  const args = process.argv.slice(2);
  const fullResync = args.includes('--full');
  const statusOnly = args.includes('--status');

  console.log('=======================================================');
  console.log('  📊 RAG Sync — Parse Server → Qdrant Vector DB');
  console.log('=======================================================\n');

  // Check Qdrant connection
  console.log('🔌 Checking Qdrant connection...');
  const conn = await checkQdrantConnection();
  if (!conn.connected) {
    console.error(`❌ Cannot connect to Qdrant: ${conn.error}`);
    console.error('   Make sure Qdrant is running. Start with:');
    console.error('   docker run -d -p 6333:6333 -p 6334:6334 qdrant/qdrant\n');
    process.exit(1);
  }
  console.log(`✅ Qdrant connected! Existing collections: ${conn.collections.join(', ') || '(none)'}\n`);

  if (statusOnly) {
    const status = await getRagStatus();
    console.log('\n📊 RAG Status:');
    console.log(JSON.stringify(status, null, 2));
    process.exit(0);
  }

  try {
    const results = await syncAllCollections(fullResync);

    console.log('\n📊 Sync Summary:');
    console.log(`   Doctors:                  ${results.doctors.synced} synced, ${results.doctors.errors} errors`);
    console.log(`   Hospitals:                ${results.hospitals.synced} synced, ${results.hospitals.errors} errors`);
    console.log(`   Specialties:              ${results.specialties.synced} synced, ${results.specialties.errors} errors`);
    console.log(`   HospitalDoctorSpecialty:  ${results.hospitalDoctorSpecialty.synced} synced, ${results.hospitalDoctorSpecialty.errors} errors`);
    console.log(`   ─────────────────────────────────────────`);
    console.log(`   Total:                    ${results.totalSynced} records in ${results.elapsedSeconds}s\n`);

    // Show final status
    const finalStatus = await getRagStatus();
    console.log('📊 Final Collection Status:');
    for (const [key, info] of Object.entries(finalStatus.collections)) {
      console.log(`   ${key}: ${info.pointCount} points (${info.status})`);
    }
    console.log(`   Total points: ${finalStatus.totalPoints}\n`);

  } catch (err) {
    console.error(`\n❌ Sync failed: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
