import crypto from 'crypto';

const ENC_KEY = Buffer.from(
  crypto.createHash('sha256').update(process.env.JWT_SECRET || 'default-secret').digest('hex').slice(0, 32)
);
const ENC_IV_LEN = 16;

export function encrypt(text: string): string {
  if (!text) return '';
  const iv = crypto.randomBytes(ENC_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

export function decrypt(text: string): string {
  if (!text || !text.includes(':')) return text;
  const [ivHex, encryptedHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '***';
  return key.slice(0, 3) + '...' + key.slice(-4);
}
