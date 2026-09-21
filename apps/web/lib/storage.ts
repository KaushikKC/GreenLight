import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const UPLOAD_URL_TTL_S = 15 * 60;
const READ_URL_TTL_S = 60 * 60;

const globalForS3 = globalThis as unknown as { s3?: S3Client };

function client(): S3Client {
  globalForS3.s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
  return globalForS3.s3;
}

const bucket = () => process.env.S3_BUCKET ?? "greenlight";

/** Presigned PUT so the browser uploads straight to S3/MinIO. */
export function presignUpload(key: string, contentType: string) {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL_S },
  );
}

/** Short-lived signed GET. Storage is private; every read goes through this. */
export function presignRead(key: string) {
  return getSignedUrl(
    client(),
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
    { expiresIn: READ_URL_TTL_S },
  );
}

/** Size of an uploaded object, or null if it doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  try {
    const head = await client().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key }),
    );
    return head.ContentLength ?? null;
  } catch (err) {
    if ((err as { name?: string }).name === "NotFound") return null;
    throw err;
  }
}
