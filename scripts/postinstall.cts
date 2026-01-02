/**
 * Postinstall script for AionUi
 * Handles native module installation for different environments
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

type PackageJson = {
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;

const isOptionalDisabled =
  process.env.npm_config_optional === 'false' || process.env.npm_config_ignore_optional === 'true';
const rawElectronVersion = packageJson.devDependencies?.electron || packageJson.optionalDependencies?.electron;
const electronVersion = rawElectronVersion ? rawElectronVersion.replace(/^[~^]/, '') : '';

const hasElectronBuilder = (): boolean => {
  try {
    require.resolve('electron-builder');
    return true;
  } catch {
    return false;
  }
};

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

function runPostInstall(): void {
  try {
    if (isOptionalDisabled) {
      console.log('Optional dependencies disabled, skipping Electron postinstall');
      return;
    }

    if (!electronVersion) {
      console.log('Electron dependency not installed, skipping Electron postinstall');
      return;
    }

    if (process.env.AIONUI_ELECTRON_REBUILD !== 'true') {
      console.log('AIONUI_ELECTRON_REBUILD not set, skipping Electron native rebuild');
      return;
    }

    if (!hasElectronBuilder()) {
      console.log('electron-builder not installed, skipping Electron postinstall');
      return;
    }

    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';

    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // In local environment, use electron-builder to install dependencies
      console.log('Local environment, installing app deps');
      execSync('npx electron-builder install-app-deps', {
        stdio: 'inherit',
        env: {
          ...process.env,
          npm_config_build_from_source: 'true'
        }
      });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Postinstall failed:', message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
const isDirectRun = require.main === module;
const isLifecycleRun = ['postinstall', 'rebuild:electron'].includes(process.env.npm_lifecycle_event || '');

if (isDirectRun || isLifecycleRun) {
  runPostInstall();
}

export default runPostInstall;
