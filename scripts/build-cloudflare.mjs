import { execFileSync } from 'node:child_process';
import { publishLicensedLibrary } from './cloudflare-assets.mjs';

const env = { ...process.env, VITE_LEONIDA_CLOUDFLARE: '1', VITE_LEONIDA_PAGES: '0' };
console.log('Building LEONIDA FM for Cloudflare Pages...');
execFileSync(process.execPath, ['scripts/build.mjs'], { env, stdio: 'inherit' });
await publishLicensedLibrary();
console.log('Cloudflare output ready: dist/client');
