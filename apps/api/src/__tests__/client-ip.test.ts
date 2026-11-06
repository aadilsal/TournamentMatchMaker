import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';
import { getClientIp, isPrivateOrLoopback } from '../lib/client-ip.js';

function mockRequest(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    ip: '8.8.8.8',
    socket: { remoteAddress: '8.8.8.8' },
    ...overrides,
  } as Request;
}

describe('client-ip', () => {
  it('uses the proxy-resolved req.ip, not a spoofable x-forwarded-for', () => {
    const req = mockRequest({
      headers: { 'x-forwarded-for': '203.0.113.10, 70.41.3.18' },
      ip: '70.41.3.18',
    });
    expect(getClientIp(req)).toBe('70.41.3.18');
  });

  it('rejects anything that is not an IP address', () => {
    expect(getClientIp(mockRequest({ ip: '1.2.3.4/../../admin' }))).toBe('');
  });

  it('normalizes ipv4-mapped addresses', () => {
    const req = mockRequest({
      socket: { remoteAddress: '::ffff:192.168.1.20' },
      ip: '::ffff:192.168.1.20',
    });
    expect(getClientIp(req)).toBe('192.168.1.20');
  });

  it('detects private and loopback addresses', () => {
    expect(isPrivateOrLoopback('127.0.0.1')).toBe(true);
    expect(isPrivateOrLoopback('10.0.0.5')).toBe(true);
    expect(isPrivateOrLoopback('192.168.0.4')).toBe(true);
    expect(isPrivateOrLoopback('172.16.4.2')).toBe(true);
    expect(isPrivateOrLoopback('8.8.8.8')).toBe(false);
  });
});
