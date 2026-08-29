import { VariableType } from './VariableResolver';

/**
 * 7×6 Type Conversion Matrix
 * Rows = source type, Columns = target type
 * Supported: string | number | boolean | json | any | array
 * (null is handled as a special source)
 */
export class TypeConverter {
  static convert(value: any, fromType: VariableType, toType: VariableType): any {
    if (fromType === toType) return value;

    // null special handling
    if (value === null || value === undefined) {
      return this.nullTo(toType);
    }

    switch (fromType) {
      case 'string':
        return this.fromString(value, toType);
      case 'number':
        return this.fromNumber(value, toType);
      case 'boolean':
        return this.fromBoolean(value, toType);
      case 'json':
        return this.fromJson(value, toType);
      case 'any':
        return this.fromAny(value, toType);
      case 'array':
        return this.fromArray(value, toType);
      case 'null':
        return this.nullTo(toType);
      default:
        return value;
    }
  }

  private static fromString(value: string, toType: VariableType): any {
    switch (toType) {
      case 'number': {
        const parsed = parseFloat(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      case 'boolean':
        return value === 'true' || value === '1' || value === 'yes' || value === 'on';
      case 'json':
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case 'any':
        return value;
      case 'array':
        return [value];
      case 'string':
      default:
        return value;
    }
  }

  private static fromNumber(value: number, toType: VariableType): any {
    switch (toType) {
      case 'string':
        return String(value);
      case 'boolean':
        return value !== 0 && !Number.isNaN(value);
      case 'json':
        return value;
      case 'any':
        return value;
      case 'array':
        return [value];
      case 'number':
      default:
        return value;
    }
  }

  private static fromBoolean(value: boolean, toType: VariableType): any {
    switch (toType) {
      case 'string':
        return value ? 'true' : 'false';
      case 'number':
        return value ? 1 : 0;
      case 'json':
        return value;
      case 'any':
        return value;
      case 'array':
        return [value];
      case 'boolean':
      default:
        return value;
    }
  }

  private static fromJson(value: any, toType: VariableType): any {
    switch (toType) {
      case 'string':
        return JSON.stringify(value);
      case 'number': {
        if (typeof value === 'object' && value !== null) {
          // Return depth (nested object levels) or object key count
          return Object.keys(value).length;
        }
        const parsed = Number(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      case 'boolean':
        if (value === null) return false;
        if (typeof value === 'object') return Object.keys(value).length > 0;
        return Boolean(value);
      case 'any':
        return value;
      case 'array': {
        if (Array.isArray(value)) return value;
        if (typeof value === 'object' && value !== null) return Object.values(value);
        return [value];
      }
      case 'json':
      default:
        return value;
    }
  }

  private static fromAny(value: any, toType: VariableType): any {
    switch (toType) {
      case 'string':
        return String(value);
      case 'number': {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? 0 : parsed;
      }
      case 'boolean':
        return Boolean(value);
      case 'json': {
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            return value;
          }
        }
        return value;
      }
      case 'array':
        return Array.from(Array.isArray(value) ? value : [value]);
      case 'any':
      default:
        return value;
    }
  }

  private static fromArray(value: any[], toType: VariableType): any {
    switch (toType) {
      case 'string':
        return JSON.stringify(value);
      case 'number':
        return value.length;
      case 'boolean':
        return value.length > 0;
      case 'json':
        return value;
      case 'any':
        return value;
      case 'array':
      default:
        return value;
    }
  }

  private static nullTo(toType: VariableType): any {
    switch (toType) {
      case 'string':
        return '';
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'json':
        return null;
      case 'any':
        return null;
      case 'array':
        return [];
      default:
        return null;
    }
  }

  /**
   * Infer the VariableType of a runtime value.
   */
  static inferType(value: any): VariableType {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return 'array';
    const t = typeof value;
    if (t === 'string') return 'string';
    if (t === 'number') return 'number';
    if (t === 'boolean') return 'boolean';
    if (t === 'object') return 'json';
    return 'any';
  }

  /**
   * Check if two types are compatible (can be implicitly converted).
   */
  static isCompatible(fromType: VariableType, toType: VariableType): boolean {
    if (fromType === toType) return true;
    if (toType === 'any') return true;
    if (fromType === 'any') return true;
    if (fromType === 'null') return true; // null can convert to anything
    // json <-> array are loosely compatible
    if (fromType === 'json' && toType === 'array') return true;
    if (fromType === 'array' && toType === 'json') return true;
    return false;
  }
}
