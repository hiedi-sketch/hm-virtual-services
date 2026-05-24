const crypto = require('crypto');

function getKey() {
  return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'fallback-key').digest();
}

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(encryptedText) {
  if (!encryptedText) return null;
  try {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

module.exports = { encrypt, decrypt };
