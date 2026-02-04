import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import express, { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ensureMeter, paymentClient } from '../../../api/src/libs/payment';
import creditRouter from '../../../api/src/routes/credit';

// Mock dependencies
vi.mock('../../../api/src/libs/payment', () => ({
  paymentClient: {
    creditGrants: {
      stats: vi.fn(),
    },
  },
  ensureMeter: vi.fn(),
}));

vi.mock('@blocklet/sdk/lib/middlewares/session', () => ({
  sessionMiddleware: vi.fn(() => (req: any, res: any, next: any) => {
    req.user = { did: 'z1test-admin-did', role: 'admin' };
    next();
  }),
}));

describe('GET /api/credit/grant-usage', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/credit', creditRouter);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Success Cases', () => {
    it('should return usage stats for date range', async () => {
      // Given: Valid meter and stats data
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
        event_name: 'aigne_hub_ai_usage',
        unit: 'AIGNE Hub Credits',
      };

      const mockStats = {
        stats: [
          {
            total_granted: '1000',
            total_consumed: '200',
            total_remaining: '800',
            grant_count: 10,
            currency_id: 'currency_abc',
            category: 'promotional',
          },
        ],
        daily_stats: [
          {
            date: '2024-01-01',
            total_granted: '500',
            total_consumed: '100',
            total_remaining: '400',
            grant_count: 5,
            currency_id: 'currency_abc',
            category: 'promotional',
          },
          {
            date: '2024-01-02',
            total_granted: '500',
            total_consumed: '100',
            total_remaining: '400',
            grant_count: 5,
            currency_id: 'currency_abc',
            category: 'promotional',
          },
        ],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);
      const timezoneOffset = 480;

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
          timezoneOffset: String(timezoneOffset),
        })
        .expect(200);

      // Then: Should return stats with summary and daily_stats
      expect(response.body).toEqual({
        summary: mockStats.stats[0],
        daily_stats: mockStats.daily_stats,
      });

      expect(paymentClient.creditGrants.stats).toHaveBeenCalledWith({
        currency_id: 'currency_abc',
        start_date: startTime,
        end_date: endTime,
        granted_by: 'z1grantor123',
        timezoneOffset,
      });
    });

    it('should return empty data for no grants', async () => {
      // Given: Valid meter but no stats
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
        event_name: 'aigne_hub_ai_usage',
        unit: 'AIGNE Hub Credits',
      };

      const mockStats = {
        stats: [],
        daily_stats: [],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return empty summary and daily_stats
      expect(response.body).toEqual({
        summary: {},
        daily_stats: [],
      });
    });

    it('should filter by grantorDid correctly', async () => {
      // Given: Valid request with specific grantorDid
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
        event_name: 'aigne_hub_ai_usage',
        unit: 'AIGNE Hub Credits',
      };

      const mockStats = {
        stats: [
          {
            total_granted: '250',
            total_consumed: '50',
            total_remaining: '200',
            grant_count: 3,
            unique_customers: 2,
          },
        ],
        daily_stats: [
          {
            date: '2024-01-01',
            total_granted: '250',
            total_consumed: '50',
            total_remaining: '200',
            grant_count: 3,
            unique_customers: 2,
          },
        ],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint with specific grantorDid
      await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1specific-grantor',
        })
        .expect(200);

      // Then: Should call SDK with correct grantorDid filter
      expect(paymentClient.creditGrants.stats).toHaveBeenCalledWith(
        expect.objectContaining({
          granted_by: 'z1specific-grantor',
        })
      );
    });

    it('should return summary and daily_stats in correct format', async () => {
      // Given: Valid response from SDK
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
        event_name: 'aigne_hub_ai_usage',
        unit: 'AIGNE Hub Credits',
      };

      const mockStats = {
        stats: [
          {
            total_granted: '1500',
            total_consumed: '300',
            total_remaining: '1200',
            grant_count: 15,
            unique_customers: 8,
            average_grant_amount: '100',
          },
        ],
        daily_stats: [
          {
            date: '2024-01-01',
            total_granted: '500',
            total_consumed: '100',
            total_remaining: '400',
            grant_count: 5,
            unique_customers: 3,
          },
          {
            date: '2024-01-02',
            total_granted: '1000',
            total_consumed: '200',
            total_remaining: '800',
            grant_count: 10,
            unique_customers: 5,
          },
        ],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should have correct structure
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('daily_stats');
      expect(Array.isArray(response.body.daily_stats)).toBe(true);
      expect(response.body.summary).toEqual(mockStats.stats[0]);
      expect(response.body.daily_stats).toEqual(mockStats.daily_stats);
    });
  });

  describe('Query Parameter Validation', () => {
    beforeEach(() => {
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
      };
      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
    });

    it('should require startTime parameter', async () => {
      // Given: Request without startTime
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('startTime');
      expect(response.body.daily_stats).toEqual([]);
      expect(paymentClient.creditGrants.stats).not.toHaveBeenCalled();
    });

    it('should require endTime parameter', async () => {
      // Given: Request without endTime
      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('endTime');
      expect(response.body.daily_stats).toEqual([]);
      expect(paymentClient.creditGrants.stats).not.toHaveBeenCalled();
    });

    it('should allow missing grantorDid parameter', async () => {
      // Given: Request without grantorDid
      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      const mockStats = {
        stats: [
          {
            total_granted: '100',
            total_consumed: '20',
            total_remaining: '80',
            grant_count: 1,
          },
        ],
        daily_stats: [],
      };

      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
        })
        .expect(200);

      // Then: Should return stats without granted_by filter
      expect(response.body.summary).toEqual(mockStats.stats[0]);
      expect(paymentClient.creditGrants.stats).toHaveBeenCalledWith(
        expect.objectContaining({
          start_date: startTime,
          end_date: endTime,
        })
      );
    });

    it('should validate time formats', async () => {
      // Given: Request with invalid time formats
      // When: GET to /grant-usage endpoint with invalid startTime
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: 'invalid',
          endTime: '123456',
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(response.body.daily_stats).toEqual([]);
      expect(paymentClient.creditGrants.stats).not.toHaveBeenCalled();
    });
  });

  describe('Authorization Cases', () => {
    it('should allow Admin role', async () => {
      // Given: User with admin role
      vi.mocked(sessionMiddleware).mockReturnValue((req: any, res: any, next: any) => {
        req.user = { did: 'z1admin-did', role: 'admin' };
        next();
      });

      // Recreate app with new middleware
      app = express();
      app.use(express.json());
      app.use('/api/credit', creditRouter);

      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
      };

      const mockStats = {
        stats: [{ total_granted: '100', total_consumed: '10', total_remaining: '90' }],
        daily_stats: [],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return success
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('daily_stats');
    });

    it('should allow Owner role', async () => {
      // Given: User with owner role
      vi.mocked(sessionMiddleware).mockReturnValue((req: any, res: any, next: any) => {
        req.user = { did: 'z1owner-did', role: 'owner' };
        next();
      });

      // Recreate app with new middleware
      app = express();
      app.use(express.json());
      app.use('/api/credit', creditRouter);

      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
      };

      const mockStats = {
        stats: [{ total_granted: '100', total_consumed: '10', total_remaining: '90' }],
        daily_stats: [],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return success
      expect(response.body).toHaveProperty('summary');
      expect(response.body).toHaveProperty('daily_stats');
    });

    it('should reject non-Admin/Owner roles (403)', async () => {
      // Given: User with regular role
      vi.mocked(sessionMiddleware).mockReturnValue((req: any, res: any, next: any) => {
        req.user = { did: 'z1user-did', role: 'user' };
        next();
      });

      // Recreate app with new middleware
      app = express();
      app.use(express.json());
      app.use('/api/credit', creditRouter);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(403);

      // Then: Should return 403 error
      expect(response.body.error).toContain('Insufficient permissions');
      expect(paymentClient.creditGrants.stats).not.toHaveBeenCalled();
    });

    it('should reject unauthenticated requests (401)', async () => {
      // Given: No authenticated user
      vi.mocked(sessionMiddleware).mockReturnValue((req: any, res: any, next: any) => {
        req.user = undefined;
        next();
      });

      // Recreate app with new middleware
      app = express();
      app.use(express.json());
      app.use('/api/credit', creditRouter);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(401);

      // Then: Should return 401 error
      expect(response.body.error).toBe('Unauthorized');
      expect(paymentClient.creditGrants.stats).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      vi.mocked(sessionMiddleware).mockReturnValue((req: any, res: any, next: any) => {
        req.user = { did: 'z1admin-did', role: 'admin' };
        next();
      });

      app = express();
      app.use(express.json());
      app.use('/api/credit', creditRouter);
    });

    it('should return empty data on SDK error (silent degradation)', async () => {
      // Given: Payment SDK throws error
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockRejectedValue(new Error('Payment service unavailable'));

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return empty data (silent degradation)
      expect(response.body).toEqual({
        summary: {
          total_granted: '0',
          total_consumed: '0',
          total_remaining: '0',
        },
        daily_stats: [],
      });
    });

    it('should handle missing meter gracefully', async () => {
      // Given: ensureMeter returns null
      vi.mocked(ensureMeter).mockResolvedValue(null);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return empty data
      expect(response.body).toEqual({
        summary: {
          total_granted: '0',
          total_consumed: '0',
          total_remaining: '0',
        },
        daily_stats: [],
      });
      expect(paymentClient.creditGrants.stats).not.toHaveBeenCalled();
    });

    it('should handle missing currency gracefully', async () => {
      // Given: Meter without currency_id
      const mockMeter = {
        id: 'meter_123',
        currency_id: null,
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Should return empty data
      expect(response.body).toEqual({
        summary: {
          total_granted: '0',
          total_consumed: '0',
          total_remaining: '0',
        },
        daily_stats: [],
      });
      expect(paymentClient.creditGrants.stats).not.toHaveBeenCalled();
    });
  });

  describe('Data Format Validation', () => {
    beforeEach(() => {
      vi.mocked(sessionMiddleware).mockReturnValue((req: any, res: any, next: any) => {
        req.user = { did: 'z1admin-did', role: 'admin' };
        next();
      });

      app = express();
      app.use(express.json());
      app.use('/api/credit', creditRouter);
    });

    it('should include all summary fields', async () => {
      // Given: Valid stats with all fields
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
      };

      const mockStats = {
        stats: [
          {
            total_granted: '5000',
            total_consumed: '1200',
            total_remaining: '3800',
            grant_count: 50,
            unique_customers: 20,
            average_grant_amount: '100',
            min_grant_amount: '10',
            max_grant_amount: '500',
          },
        ],
        daily_stats: [],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Summary should include all fields
      expect(response.body.summary).toEqual(mockStats.stats[0]);
      expect(response.body.summary).toHaveProperty('total_granted');
      expect(response.body.summary).toHaveProperty('grant_count');
      expect(response.body.summary).toHaveProperty('unique_customers');
    });

    it('should include all daily_stats fields', async () => {
      // Given: Valid daily stats with all fields
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
      };

      const mockStats = {
        stats: [{}],
        daily_stats: [
          {
            date: '2024-01-01',
            total_granted: '1000',
            total_consumed: '200',
            total_remaining: '800',
            grant_count: 10,
            unique_customers: 5,
            average_grant_amount: '100',
          },
          {
            date: '2024-01-02',
            total_granted: '2000',
            total_consumed: '500',
            total_remaining: '1500',
            grant_count: 15,
            unique_customers: 8,
            average_grant_amount: '133.33',
          },
        ],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Daily stats should include all fields
      expect(response.body.daily_stats).toEqual(mockStats.daily_stats);
      response.body.daily_stats.forEach((stat: any) => {
        expect(stat).toHaveProperty('date');
        expect(stat).toHaveProperty('total_granted');
        expect(stat).toHaveProperty('grant_count');
        expect(stat).toHaveProperty('unique_customers');
      });
    });

    it('should handle dates in YYYY-MM-DD format', async () => {
      // Given: Stats with properly formatted dates
      const mockMeter = {
        id: 'meter_123',
        currency_id: 'currency_abc',
      };

      const mockStats = {
        stats: [{}],
        daily_stats: [
          {
            date: '2024-01-01',
            total_granted: '100',
            total_consumed: '20',
            total_remaining: '80',
            grant_count: 1,
            unique_customers: 1,
          },
          {
            date: '2024-01-02',
            total_granted: '200',
            total_consumed: '40',
            total_remaining: '160',
            grant_count: 2,
            unique_customers: 1,
          },
        ],
      };

      vi.mocked(ensureMeter).mockResolvedValue(mockMeter as any);
      vi.mocked(paymentClient.creditGrants.stats).mockResolvedValue(mockStats as any);

      const startTime = Math.floor(new Date('2024-01-01').getTime() / 1000);
      const endTime = Math.floor(new Date('2024-01-02').getTime() / 1000);

      // When: GET to /grant-usage endpoint
      const response = await request(app)
        .get('/api/credit/grant-usage')
        .query({
          startTime: String(startTime),
          endTime: String(endTime),
          grantorDid: 'z1grantor123',
        })
        .expect(200);

      // Then: Dates should be in YYYY-MM-DD format
      response.body.daily_stats.forEach((stat: any) => {
        expect(stat.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      });
    });
  });
});
