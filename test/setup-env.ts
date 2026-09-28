// Integration tests run against DATABASE_URL_TEST (never the dev/prod DB).
// When it is not set the integration suites skip themselves.
import 'dotenv/config';

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  process.env.DIRECT_URL = process.env.DIRECT_URL_TEST ?? process.env.DATABASE_URL_TEST;
}
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-0123456789abcdef0123456789';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_DIR = process.env.STORAGE_DIR_TEST ?? './storage-test';
process.env.EMAIL_TRANSPORT = 'none';
process.env.OUTBOX_DISABLED = '1';
process.env.THROTTLE_DISABLED = '1';
process.env.NODE_ENV = 'test';
