/**
 * Settings Installer
 * Registers Throttle's Dynamic Autonomy PreToolUse hook into ~/.claude/settings.json
 * alongside (never replacing) keeperhub-wallet-hook.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SettingsInstallResult {
  success: boolean;
  settingsPath: string;
  hookAdded: boolean;
  message: string;
}

export function installThrottlePreToolUseHook(hookCommand: string = 'throttle-hook'): SettingsInstallResult {
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  try {
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        settings = JSON.parse(raw);
      } catch {
        settings = {};
      }
    }

    // Ensure preToolUseHooks list exists
    if (!Array.isArray(settings.preToolUseHooks)) {
      settings.preToolUseHooks = [];
    }

    const alreadyExists = settings.preToolUseHooks.some(
      (h: any) => h.command === hookCommand || h.name === 'throttle-dynamic-autonomy-hook'
    );

    if (!alreadyExists) {
      settings.preToolUseHooks.push({
        name: 'throttle-dynamic-autonomy-hook',
        command: hookCommand,
        description: 'Throttle Dynamic Autonomy Controller PreToolUse Gate',
      });

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
      return {
        success: true,
        settingsPath,
        hookAdded: true,
        message: 'Successfully registered Throttle PreToolUse hook in ~/.claude/settings.json',
      };
    }

    return {
      success: true,
      settingsPath,
      hookAdded: false,
      message: 'Throttle PreToolUse hook is already configured in ~/.claude/settings.json',
    };
  } catch (err: any) {
    return {
      success: false,
      settingsPath,
      hookAdded: false,
      message: `Failed to update ~/.claude/settings.json: ${err.message}`,
    };
  }
}
