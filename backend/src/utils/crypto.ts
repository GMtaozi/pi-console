import crypto from 'crypto';

const ENC_KEY = Buffer.from(
  crypto.createHash('sha256').update(process.env.JWT_SECRET || 'default-secret').digest('hex').slice(0, 32)
);
const ENC_IV_LEN = 12; // GCM uses 12-byte IV for better performance
const ALGORITHM_GCM = 'aes-256-gcm';
const ALGORITHM_CBC = 'aes-256-cbc';

interface EncryptedData {
  iv: string;
  authTag?: string;
  ciphertext: string;
  algorithm: 'gcm' | 'cbc';
  keyVersion?: number;
}

// ========== GCM Encryption (new data) ==========
export function encryptGCM(plaintext: string): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(ENC_IV_LEN);
  const cipher = crypto.createCipheriv(ALGORITHM_GCM, ENC_KEY, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  const data: EncryptedData = {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    ciphertext: encrypted,
    algorithm: 'gcm',
    keyVersion: 1,
  };
  return JSON.stringify(data);
}

// ========== Backward-compatible encrypt (routes to GCM) ==========
export function encrypt(plaintext: string): string {
  return encryptGCM(plaintext);
}

// ========== Dual-algorithm decrypt (CBC legacy + GCM new) ==========
export function decrypt(text: string): string {
  if (!text) return text;

  // Try to parse as JSON (GCM format)
  try {
    const data: EncryptedData = JSON.parse(text);

    if (data.algorithm === 'gcm') {
      const decipher = crypto.createDecipheriv(
        ALGORITHM_GCM,
        ENC_KEY,
        Buffer.from(data.iv, 'hex')
      );
      decipher.setAuthTag(Buffer.from(data.authTag!, 'hex'));
      let decrypted = decipher.update(data.ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }

    // Fallback: CBC (legacy data)
    if (data.algorithm === 'cbc') {
      const decipher = crypto.createDecipheriv(
        ALGORITHM_CBC,
        ENC_KEY,
        Buffer.from(data.iv, 'hex')
      );
      let decrypted = decipher.update(data.ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  } catch {
    // Not JSON or unknown format — try legacy CBC (iv:ciphertext)
  }

  // Legacy CBC format: ivHex:ciphertextHex
  if (text.includes(':')) {
    const [ivHex, encryptedHex] = text.split(':');
    if (ivHex && encryptedHex) {
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM_CBC, ENC_KEY, iv);
      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
  }

  // If nothing works, return as-is (might be unencrypted)
  return text;
}

// ========== API Key masking ==========
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '***';
  // Format: sk-****xxxx (show prefix "sk-" then mask middle, show last 4)
  return key.slice(0, 3) + '****' + key.slice(-4);
}
