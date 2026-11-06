import { isIP } from 'net';
import type { Request } from 'express';

function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

/** Proxy-resolved client IP (trust proxy = 1); '' when it is not a valid address. */
export function getClientIp(req: Request): string {
  const ip = normalizeIp(req.ip || req.socket?.remoteAddress || '');
  return isIP(ip) ? ip : '';
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
