import 'dotenv/config';
import { ensureR2UploadCors, R2_BUCKET_NAME, r2Client } from '@/lib/r2';
import { logError } from '@/lib/logger';

async function main() {
  const origins = await ensureR2UploadCors();
  console.log(`Configured upload CORS on bucket "${R2_BUCKET_NAME}" for origins:`);
  for (const origin of origins) {
    console.log(`  - ${origin}`);
  }
}

main()
  .catch((error) => {
    logError('Failed to configure R2 upload CORS:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    r2Client.destroy();
  });
