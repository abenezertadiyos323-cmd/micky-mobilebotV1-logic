import dotenv from 'dotenv';
import { resolve } from 'node:path';

export function loadN8nEnv(repoRoot) {
  dotenv.config({ path: resolve(repoRoot, '.env') });
  dotenv.config({ path: resolve(repoRoot, '.env.local'), override: true });
}
