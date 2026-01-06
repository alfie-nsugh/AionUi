#!/usr/bin/env ts-node
/**
 * Electron-free password reset entrypoint for development/WebUI mode.
 */
import { resetPasswordCLI } from '../src/utils/resetPasswordCLI';

const args = process.argv.slice(2);

const hasFlag = (flag: string): boolean => args.includes(flag);

const parseUsername = (): string => {
  const resetWithValue = args.find((arg) => arg.startsWith('--resetpass='));
  if (resetWithValue) {
    const value = resetWithValue.split('=')[1];
    if (value) {
      return value;
    }
  }

  const resetIndex = args.indexOf('--resetpass');
  if (resetIndex !== -1) {
    const next = args[resetIndex + 1];
    if (next && !next.startsWith('--')) {
      return next;
    }
  }

  const direct = args.find((arg) => !arg.startsWith('--'));
  return direct || 'admin';
};

if (hasFlag('-h') || hasFlag('--help')) {
  console.log('Usage:');
  console.log('  npm run resetpass -- [username]');
  console.log('  npm run resetpass -- --resetpass [username]');
  process.exit(0);
}

void resetPasswordCLI(parseUsername());
