import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, 'dist_deploy');

// Ensure clean outDir
if (fs.existsSync(outDir)) {
  fs.rmSync(outDir, { recursive: true, force: true });
}
fs.mkdirSync(outDir, { recursive: true });

// Copy root landing page assets
const filesToCopy = [
  'index.html',
  'logo.png',
  'favicon.png',
  'favicon.ico',
  'apple-touch-icon.png',
];

for (const file of filesToCopy) {
  const src = path.join(rootDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(outDir, file));
  }
}

// Copy dashboard dist into outDir/dashboard
const dashboardDist = path.join(rootDir, 'packages', 'dashboard', 'dist');
if (fs.existsSync(dashboardDist)) {
  fs.cpSync(dashboardDist, path.join(outDir, 'dashboard'), { recursive: true });
}

console.log('[Vercel Prepare] Successfully packaged landing page and dashboard to:', outDir);
