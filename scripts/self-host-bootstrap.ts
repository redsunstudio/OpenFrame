import 'dotenv/config';
import { ensureR2BucketExists, ensureR2UploadCors, R2_BUCKET_NAME, r2Client } from '@/lib/r2';
import { isS3VideoUploadsEnabled } from '@/lib/feature-flags';
import { logError } from '@/lib/logger';

const shouldCreateBucket = /^(1|true|yes|on)$/i.test(
  process.env.SELF_HOSTED_AUTO_CREATE_BUCKET ?? ''
);

async function main() {
  if (!shouldCreateBucket) {
    console.log('Skipping self-host bucket bootstrap');
    return;
  }

  console.log(`Ensuring object storage bucket exists: ${R2_BUCKET_NAME}`);
  await ensureR2BucketExists();
  console.log(`Bucket is ready: ${R2_BUCKET_NAME}`);

  if (isS3VideoUploadsEnabled()) {
    try {
      const origins = await ensureR2UploadCors();
      console.log(`Configured upload CORS for origins: ${origins.join(', ')}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Skipping automatic bucket CORS setup (${message}). ` +
          'If direct S3 uploads fail in the browser, configure bucket CORS manually.'
      );
    }
  }
}

main()
  .catch((error) => {
    logError('Self-host bootstrap failed:', error);
    process.exit(1);
  })
  .finally(() => {
    r2Client.destroy();
  });
