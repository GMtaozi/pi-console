import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolRegistry, Tool } from '../engine/ToolRegistry';

const execAsync = promisify(exec);

// Extensions installed to backend/extensions/<extId>/ independent directory
const EXTENSIONS_DIR = path.resolve(__dirname, '../../extensions');

export interface ExtensionInstallResult {
  success: boolean;
  installPath?: string;
  installedVersion?: string;
  exports?: string[];
  tools?: Tool[];
  error?: string;
}

export class ExtensionManager {
  static getExtensionDir(extId: string): string {
    return path.join(EXTENSIONS_DIR, extId);
  }

  static async ensureExtensionsDir(): Promise<void> {
    await fs.mkdir(EXTENSIONS_DIR, { recursive: true });
  }

  static async installExtension(extId: string, packageName: string, version: string = 'latest'): Promise<ExtensionInstallResult> {
    await this.ensureExtensionsDir();
    const extDir = this.getExtensionDir(extId);
    await fs.mkdir(extDir, { recursive: true });

    try {
      // Install package in isolated directory
      const { stdout, stderr } = await execAsync(
        `npm install ${packageName}@${version}`,
        { cwd: extDir, timeout: 120000 }
      );

      // Introspect exports and tools
      let exportsList: string[] = [];
      let installedVersion = version;
      let tools: Tool[] = [];

      try {
        const modulePath = require.resolve(packageName, { paths: [extDir] });
        // Clear require cache to pick up newly installed module
        delete require.cache[modulePath];
        const mod = require(modulePath);
        exportsList = Object.keys(mod).filter((k) => typeof mod[k] === 'function');

        // Try to read installed version
        const pkgJsonPath = path.join(extDir, 'node_modules', packageName, 'package.json');
        const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8'));
        installedVersion = pkgJson.version || version;

        // Extract tools if the module exports a tools array
        if (mod.tools && Array.isArray(mod.tools)) {
          tools = mod.tools;
        }
      } catch (loadErr: any) {
        console.warn(`[ExtensionManager] Could not introspect ${packageName}:`, loadErr.message);
      }

      // Register tools to ToolRegistry
      if (tools.length > 0) {
        ToolRegistry.register(extId, tools);
      }

      return {
        success: true,
        installPath: extDir,
        installedVersion,
        exports: exportsList,
        tools,
      };
    } catch (err: any) {
      console.error(`[ExtensionManager] Install failed for ${packageName}:`, err);
      return {
        success: false,
        error: err.stderr || err.message || String(err),
      };
    }
  }

  static async uninstallExtension(extId: string, packageName: string): Promise<ExtensionInstallResult> {
    const extDir = this.getExtensionDir(extId);

    try {
      // Unregister tools
      ToolRegistry.unregister(extId);

      // Remove extension directory
      await fs.rm(extDir, { recursive: true, force: true });

      return { success: true };
    } catch (err: any) {
      console.error(`[ExtensionManager] Uninstall failed for ${packageName}:`, err);
      return {
        success: false,
        error: err.message || String(err),
      };
    }
  }

  static loadExtensionModule(extDir: string, packageName: string): any {
    const modulePath = require.resolve(packageName, { paths: [extDir] });
    return require(modulePath);
  }
}
