#!/usr/bin/env tsx
/**
 * Simplified build script for AionUi
 * Coordinates Electron Forge (Vite) and electron-builder (packaging)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

type Arch = 'x64' | 'arm64' | 'ia32' | 'armv7l';

const scriptDir = __dirname;

const args = process.argv.slice(2);
const archList: Arch[] = ['x64', 'arm64', 'ia32', 'armv7l'];

const builderArgs = args
  .filter((arg) => {
    if (arg === 'auto') return false;
    if (archList.includes(arg as Arch)) return false;
    if (arg.startsWith('--') && archList.includes(arg.slice(2) as Arch)) return false;
    return true;
  })
  .join(' ');

const getTargetArchFromConfig = (platform: string): string | null => {
  try {
    const configPath = path.resolve(scriptDir, '../electron-builder.yml');
    const content = fs.readFileSync(configPath, 'utf8');

    const platformRegex = new RegExp(`^${platform}:\\s*$`, 'm');
    const platformMatch = content.match(platformRegex);
    if (!platformMatch) return null;

    const platformStartIndex = platformMatch.index ?? 0;
    const afterPlatform = content.slice(platformStartIndex + platformMatch[0].length);
    const nextPlatformMatch = afterPlatform.match(/^[a-zA-Z][a-zA-Z0-9]*:/m);
    const platformBlock = nextPlatformMatch
      ? content.slice(platformStartIndex, platformStartIndex + platformMatch[0].length + nextPlatformMatch.index)
      : content.slice(platformStartIndex);

    const archMatch = platformBlock.match(/arch:\s*\[\s*([a-z0-9_]+)/i);
    return archMatch ? archMatch[1].trim() : null;
  } catch {
    return null;
  }
};

const buildMachineArch = process.arch;
let targetArch: string;
let multiArch = false;

const rawArchArgs = args
  .filter((arg) => {
    if (archList.includes(arg as Arch)) return true;
    if (arg.startsWith('--') && archList.includes(arg.slice(2) as Arch)) return true;
    return false;
  })
  .map((arg) => (arg.startsWith('--') ? arg.slice(2) : arg));

const archArgs = [...new Set(rawArchArgs)];

if (archArgs.length > 1) {
  multiArch = true;
  targetArch = archArgs[0];
  console.log(`🔨 Multi-architecture build detected: ${archArgs.join(', ')}`);
} else if (args[0] === 'auto') {
  let detectedPlatform: string | null = null;
  if (builderArgs.includes('--linux')) detectedPlatform = 'linux';
  else if (builderArgs.includes('--mac')) detectedPlatform = 'mac';
  else if (builderArgs.includes('--win')) detectedPlatform = 'win';

  const configArch = detectedPlatform ? getTargetArchFromConfig(detectedPlatform) : null;
  targetArch = configArch || buildMachineArch;
} else {
  targetArch = archArgs[0] || buildMachineArch;
}

console.log(`🔨 Building for architecture: ${targetArch}`);
console.log(`📋 Builder arguments: ${builderArgs || '(none)'}`);

const packageJsonPath = path.resolve(scriptDir, '../package.json');

const ensureDir = (srcDir: string, destRoot: string, name: string): void => {
  const src = path.join(srcDir, name);
  const dest = path.join(destRoot, name);

  if (fs.existsSync(src) && src !== dest) {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }

    if (process.platform === 'win32') {
      execSync(`xcopy "${src}" "${dest}" /E /I /H /Y /Q`, { stdio: 'inherit' });
    } else {
      execSync(`cp -r "${src}" "${dest}"`, { stdio: 'inherit' });
    }
  }
};

try {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as { main?: string };
  if (packageJson.main !== '.vite/main/index.js') {
    packageJson.main = '.vite/main/index.js';
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  }

  console.log(`📦 Building ${targetArch}...`);
  execSync(`npm exec electron-forge -- package --arch=${targetArch}`, {
    stdio: 'inherit',
    env: {
      ...process.env,
      ELECTRON_BUILDER_ARCH: targetArch,
      FORGE_SKIP_NATIVE_REBUILD: 'false',
    },
  });

  const viteDir = path.resolve(scriptDir, '../.vite');
  if (!fs.existsSync(viteDir)) {
    throw new Error('Forge did not generate .vite directory');
  }

  const possibleDirs = [
    path.join(viteDir, targetArch),
    path.join(viteDir, buildMachineArch),
    viteDir,
  ];

  let sourceDir = viteDir;
  for (const dir of possibleDirs) {
    if (fs.existsSync(path.join(dir, 'main')) || fs.existsSync(path.join(dir, 'renderer'))) {
      sourceDir = dir;
      break;
    }
  }

  ensureDir(sourceDir, viteDir, 'main');
  ensureDir(sourceDir, viteDir, 'preload');
  ensureDir(sourceDir, viteDir, 'renderer');

  const isRelease = Boolean(process.env.GITHUB_REF?.startsWith('refs/tags/v'));
  const publishArg = isRelease ? '' : '--publish=never';

  let archFlag = '';
  if (multiArch) {
    archFlag = archArgs.map((arch) => `--${arch}`).join(' ');
    console.log(`🚀 Packaging for multiple architectures: ${archArgs.join(', ')}...`);
  } else {
    archFlag = `--${targetArch}`;
    console.log(`🚀 Creating distributables for ${targetArch}...`);
  }

  execSync(`npx electron-builder ${builderArgs} ${archFlag} ${publishArg}`, { stdio: 'inherit' });

  console.log('✅ Build completed!');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('❌ Build failed:', message);
  process.exit(1);
}
