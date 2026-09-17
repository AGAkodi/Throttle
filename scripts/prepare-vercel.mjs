import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Find repository root by searching upwards for pnpm-workspace.yaml
let rootDir = __dirname;
while (rootDir !== path.dirname(rootDir)) {
  if (fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml'))) {
    break;
  }
  rootDir = path.dirname(rootDir);
}

console.log('[Vercel Prepare] Resolved repository root:', rootDir);

// Build all packages from rootDir
console.log('[Vercel Prepare] Building packages with pnpm -r run build...');
execSync('pnpm -r run build', { cwd: rootDir, stdio: 'inherit' });

// We write outputs to both rootDir/dist_deploy and process.cwd()/dist_deploy
const targetDirs = Array.from(new Set([
  path.resolve(rootDir, 'dist_deploy'),
  path.resolve(process.cwd(), 'dist_deploy')
]));

for (const outDir of targetDirs) {
  if (fs.existsSync(outDir)) {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outDir, { recursive: true });

  const dashboardDist = path.join(rootDir, 'packages', 'dashboard', 'dist');
  if (fs.existsSync(dashboardDist)) {
    // 1. Deploy the unified React app (Landing Page + Operator Console) directly at root
    fs.cpSync(dashboardDist, outDir, { recursive: true });
    // 2. Also keep a copy in /dashboard for backwards compatibility
    fs.cpSync(dashboardDist, path.join(outDir, 'dashboard'), { recursive: true });
  }

  // 3. Ensure all brand assets are present at root
  const brandAssets = [
    'logo.png',
    'favicon.png',
    'favicon.ico',
    'apple-touch-icon.png',
  ];

  for (const file of brandAssets) {
    const src = path.join(rootDir, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(outDir, file));
    }
  }

  // 4. Save standalone HTML page as showcase.html
  const rootIndex = path.join(rootDir, 'index.html');
  if (fs.existsSync(rootIndex)) {
    fs.copyFileSync(rootIndex, path.join(outDir, 'showcase.html'));
  }

  console.log('[Vercel Prepare] Successfully packaged unified landing page + operator dashboard to:', outDir);
}
