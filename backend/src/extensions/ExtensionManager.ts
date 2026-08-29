import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ToolRegistry, Tool } from '../engine/ToolRegistry';
import { NodeRegistry, NodeMetadata, NodeExecutor } from '../engine/NodeRegistry';
import { NodeExecutorRegistry } from '../engine/NodeExecutorRegistry';

const execAsync = promisify(exec);

// Extensions installed to backend/extensions/<extId>/ independent directory
const EXTENSIONS_DIR = path.resolve(__dirname, '../../extensions');

export interface ExtensionInstallResult {
  success: boolean;
  installPath?: string;
  installedVersion?: string;
  exports?: string[];
  tools?: Tool[];
  nodes?: NodeMetadata[];
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
      let nodes: NodeMetadata[] = [];

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

        // Phase 2: Extract nodes if the module exports a nodes array
        if (mod.nodes && Array.isArray(mod.nodes)) {
          for (const nodeMeta of mod.nodes) {
            if (this.isValidNodeMetadata(nodeMeta)) {
              nodes.push(nodeMeta);
            }
          }
        }

        // Also check for default export with nodes
        if (mod.default && mod.default.nodes && Array.isArray(mod.default.nodes)) {
          for (const nodeMeta of mod.default.nodes) {
            if (this.isValidNodeMetadata(nodeMeta)) {
              nodes.push(nodeMeta);
            }
          }
        }
      } catch (loadErr: any) {
        console.warn(`[ExtensionManager] Could not introspect ${packageName}:`, loadErr.message);
      }

      // Register tools to ToolRegistry
      if (tools.length > 0) {
        ToolRegistry.register(extId, tools);
      }

      // Phase 2: Register nodes to NodeRegistry
      if (nodes.length > 0) {
        for (const nodeMeta of nodes) {
          NodeRegistry.register(nodeMeta);
          // Also try to register executor if provided
          if (nodeMeta.executorClass) {
            try {
              const modulePath = require.resolve(packageName, { paths: [extDir] });
              const mod = require(modulePath);
              const ExecutorClass = mod[nodeMeta.executorClass] || mod.default?.[nodeMeta.executorClass];
              if (ExecutorClass && typeof ExecutorClass === 'function') {
                const executor: NodeExecutor = new ExecutorClass();
                NodeExecutorRegistry.register(executor);
              }
            } catch (e: any) {
              console.warn(`[ExtensionManager] Could not load executor ${nodeMeta.executorClass}:`, e.message);
            }
          }
        }
      }

      return {
        success: true,
        installPath: extDir,
        installedVersion,
        exports: exportsList,
        tools,
        nodes,
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

      // Phase 2: Unregister nodes from this extension
      const nodes = NodeRegistry.listMetadata();
      for (const meta of nodes) {
        // Nodes from extensions don't have a direct extId reference,
        // but we can track them via a custom property if needed.
        // For now, we skip auto-unregistration of nodes.
      }

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

  private static isValidNodeMetadata(obj: any): obj is NodeMetadata {
    return (
      obj &&
      typeof obj.type === 'string' &&
      typeof obj.label === 'string' &&
      typeof obj.category === 'string' &&
      Array.isArray(obj.inputs) &&
      Array.isArray(obj.outputs) &&
      obj.configSchema && typeof obj.configSchema === 'object'
    );
  }
}
