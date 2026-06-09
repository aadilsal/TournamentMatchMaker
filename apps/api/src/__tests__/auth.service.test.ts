import { jest } from '@jest/globals';
import bcrypt from 'bcryptjs';
import { AuthService } from '../modules/auth/auth.service.js';

const mockEnv = {
  NODE_ENV: 'test' as const,
  PORT: 3000,
  DATABASE_URL: 'postgresql://test',
  REDIS_URL: 'redis://localhost',
  JWT_ACCESS_SECRET: 'test-access-secret-minimum-32-characters-long',
  JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-32-characters-long',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  CORS_ORIGIN: 'http://localhost:5173',
};

describe('AuthService', () => {
  describe('password hashing', () => {
    it('should hash passwords with bcrypt cost 12', async () => {
      const hash = await bcrypt.hash('password123', 12);
      const valid = await bcrypt.compare('password123', hash);
      expect(valid).toBe(true);
    });

    it('should reject incorrect passwords', async () => {
      const hash = await bcrypt.hash('password123', 12);
      const valid = await bcrypt.compare('wrongpassword', hash);
      expect(valid).toBe(false);
    });
  });

  describe('register', () => {
    it('should create user and return tokens', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-1',
            email: 'test@example.com',
            username: 'testuser',
            country: null,
            city: null,
            has_vr_headset: false,
            vr_device_type: null,
            latitude: null,
            longitude: null,
            skill_tier: 3,
            role: 'player',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const mockPool = { query: mockQuery } as never;
      const mockRedis = { setex: jest.fn() } as never;
      const service = new AuthService(mockPool, mockRedis, mockEnv);

      const result = await service.register({
        email: 'test@example.com',
        password: 'password123',
        username: 'testuser',
        hasVrHeadset: false,
      });

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('should reject invalid credentials', async () => {
      const hash = await bcrypt.hash('password123', 12);
      const mockPool = {
        query: jest.fn().mockResolvedValue({
          rows: [{ password_hash: hash, id: '1', email: 'test@example.com', username: 'u', country: null, city: null, has_vr_headset: false, vr_device_type: null, latitude: null, longitude: null, skill_tier: 3, role: 'player', created_at: new Date(), updated_at: new Date() }],
        }),
      } as never;
      const mockRedis = {} as never;
      const service = new AuthService(mockPool, mockRedis, mockEnv);

      await expect(service.login('test@example.com', 'wrong')).rejects.toThrow('Invalid email or password');
    });

    it('should login with valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 12);
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({
          rows: [{
            id: 'user-1',
            email: 'test@example.com',
            password_hash: hash,
            username: 'testuser',
            country: null,
            city: null,
            has_vr_headset: false,
            vr_device_type: null,
            latitude: null,
            longitude: null,
            skill_tier: 3,
            role: 'player',
            created_at: new Date(),
            updated_at: new Date(),
          }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const mockPool = { query: mockQuery } as never;
      const mockRedis = {} as never;
      const service = new AuthService(mockPool, mockRedis, mockEnv);

      const result = await service.login('test@example.com', 'password123');
      expect(result.accessToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });
  });
});
