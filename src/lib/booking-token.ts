import crypto from 'crypto';

type BookingTokenPayload = {
  /** Google Calendar event id */
  eventId: string;
  /** Guest email (used to bind the token to the recipient) */
  email: string;
  /** Issued-at (unix seconds) */
  iat: number;
  /** Expiration (unix seconds) */
  exp: number;
  /** Random nonce to avoid predictability/patterns */
  nonce: string;
};

function getSigningSecret(): Buffer {
  const secret = process.env.BOOKING_SIGNING_SECRET;
  if (!secret) {
    throw new Error('Missing BOOKING_SIGNING_SECRET');
  }
  // Treat as utf-8; user can set a long random string.
  return Buffer.from(secret, 'utf8');
}

function b64urlEncode(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function b64urlDecodeToBuffer(s: string): Buffer {
  const padLen = (4 - (s.length % 4)) % 4;
  const padded = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen);
  return Buffer.from(padded, 'base64');
}

function sign(data: Buffer): string {
  const mac = crypto.createHmac('sha256', getSigningSecret()).update(data).digest();
  return b64urlEncode(mac);
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function createBookingManageToken(params: {
  eventId: string;
  email: string;
  /** default: 30 days */
  ttlSeconds?: number;
}): string {
  const now = Math.floor(Date.now() / 1000);
  const ttl = params.ttlSeconds ?? 60 * 60 * 24 * 30;
  const payload: BookingTokenPayload = {
    eventId: params.eventId,
    email: params.email.toLowerCase(),
    iat: now,
    exp: now + ttl,
    nonce: b64urlEncode(crypto.randomBytes(16)),
  };

  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const bodyB64 = b64urlEncode(body);
  const sig = sign(Buffer.from(bodyB64, 'utf8'));
  return `${bodyB64}.${sig}`;
}

export function verifyBookingManageToken(token: string): { ok: true; payload: BookingTokenPayload } | { ok: false; reason: string } {
  const parts = token.split('.');
  if (parts.length !== 2) return { ok: false, reason: 'Invalid token format' };
  const [bodyB64, sig] = parts;

  const expectedSig = sign(Buffer.from(bodyB64, 'utf8'));
  if (!timingSafeEqualStr(sig, expectedSig)) return { ok: false, reason: 'Invalid token signature' };

  let payload: BookingTokenPayload;
  try {
    payload = JSON.parse(b64urlDecodeToBuffer(bodyB64).toString('utf8'));
  } catch {
    return { ok: false, reason: 'Invalid token payload' };
  }

  if (!payload?.eventId || !payload?.email || !payload?.iat || !payload?.exp || !payload?.nonce) {
    return { ok: false, reason: 'Invalid token payload' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return { ok: false, reason: 'Token expired' };

  return { ok: true, payload };
}

