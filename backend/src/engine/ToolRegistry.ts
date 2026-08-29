export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  execute: (params: any) => Promise<any>;
}

class Registry {
  private tools = new Map<string, Tool>();

  register(extId: string, tools: Tool[]): void {
    for (const tool of tools) {
      const qualifiedName = `${extId}.${tool.name}`;
      this.tools.set(qualifiedName, tool);
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  listNames(): string[] {
    return Array.from(this.tools.keys());
  }

  unregister(extId: string): void {
    for (const [key] of this.tools) {
      if (key.startsWith(`${extId}.`)) {
        this.tools.delete(key);
      }
    }
  }

  clear(): void {
    this.tools.clear();
  }
}

export const ToolRegistry = new Registry();
