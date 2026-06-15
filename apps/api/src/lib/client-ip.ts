import type { Request } from 'express';

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const first = raw.split(',')[0]?.trim();
    if (first) return normalizeIp(first);
  }

  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return normalizeIp(realIp);
  }

  return normalizeIp(req.ip || req.socket.remoteAddress || '');
}

export function isPrivateOrLoopback(ip: string): boolean {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip === 'localhost') return true;
  if (ip.startsWith('10.')) return true;
  if (ip.startsWith('192.168.')) return true;
  if (ip.startsWith('172.')) {
    const second = Number(ip.split('.')[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}
