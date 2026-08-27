const crypto = require('crypto');

/**
 * Encryption for third-party credentials at rest.
 *
 * The key comes from SECRETS_KEY when set, otherwise it is derived from
 * JWT_SECRET so an existing deploy needs no new configuration. That derivation
 * ties stored secrets to JWT_SECRET: rotate it and anything encrypted here has
 * to be entered again, which is inconvenient but never silently wrong — the
 * decrypt fails loudly rather than returning rubbish.
 */
const KEY = crypto.scryptSync(
  process.env.SECRETS_KEY || process.env.JWT_SECRET || '',
  'print-shop-secrets-v1',
  32
);

function encrypt(plainText) {
  if (plainText == null || plainText === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), body.toString('base64')].join(':');
}

function decrypt(stored) {
  if (!stored) return null;
  const [version, iv, tag, body] = String(stored).split(':');
  if (version !== 'v1' || !iv || !tag || !body) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Wrong key, or the value was tampered with. Either way it is unusable.
    return null;
  }
}

/** Show enough of a token to recognise it, never enough to use it. */
function maskToken(token) {
  if (!token) return null;
  const text = String(token);
  if (text.length <= 8) return '••••';
  return `${text.slice(0, 6)}…${text.slice(-4)}`;
}

module.exports = { encrypt, decrypt, maskToken };
