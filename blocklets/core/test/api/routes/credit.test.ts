import express, { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { paymentClient } from '../../../api/src/libs/payment';
import creditRouter from '../../../api/src/routes/credit';

// Mock dependencies
vi.mock('../../../api/src/libs/payment', () => ({
  paymentClient: {
    creditGrants: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@blocklet/sdk/lib/middlewares/session', () => ({
  sessionMiddleware: vi.fn(() => (req: any, res: any, next: any) => {
    req.user = { did: 'z1test-user-did' };
    next();
  }),
}));

vi.mock('../../../api/src/middlewares/verify-site-group', () => ({
  verifySiteGroup: vi.fn((req: any, res: any, next: any) => next()),
}));

describe('POST /api/credit/grant', () => {
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
    it('should grant credits with valid userId, amount, and grantorDid', async () => {
      // Given: Valid grant request
      const mockResult = {
        id: 'grant_123',
        amount: '100',
        customer_id: 'z1user123',
        grantor_did: 'z1grantor456',
      };

      vi.mocked(paymentClient.creditGrants.create).mockResolvedValue(mockResult as any);

      const requestBody = {
        userId: 'z1user123',
        amount: 100,
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return success with grant details
      expect(response.body).toEqual({
        success: true,
        grantId: 'grant_123',
        amount: '100',
      });

      expect(paymentClient.creditGrants.create).toHaveBeenCalledWith({
        customer_id: 'z1user123',
        amount: '100',
        reason: 'Credit grant from AIGNE Hub',
        grantor_did: 'z1grantor456',
        metadata: {
          grantedBy: 'z1test-user-did',
          grantedAt: expect.any(String),
        },
      });
    });

    it('should grant credits with optional reason field', async () => {
      // Given: Grant request with custom reason
      const mockResult = {
        id: 'grant_456',
        amount: '50',
        customer_id: 'z1user789',
        grantor_did: 'z1grantor123',
      };

      vi.mocked(paymentClient.creditGrants.create).mockResolvedValue(mockResult as any);

      const requestBody = {
        userId: 'z1user789',
        amount: 50,
        grantorDid: 'z1grantor123',
        reason: 'Promotional credit for new user',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should use custom reason
      expect(response.body.success).toBe(true);
      expect(paymentClient.creditGrants.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Promotional credit for new user',
        })
      );
    });

    it('should handle large amounts', async () => {
      // Given: Large credit grant
      const mockResult = {
        id: 'grant_789',
        amount: '1000000',
        customer_id: 'z1user999',
        grantor_did: 'z1grantor999',
      };

      vi.mocked(paymentClient.creditGrants.create).mockResolvedValue(mockResult as any);

      const requestBody = {
        userId: 'z1user999',
        amount: 1000000,
        grantorDid: 'z1grantor999',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should handle large amount correctly
      expect(response.body).toEqual({
        success: true,
        grantId: 'grant_789',
        amount: '1000000',
      });
    });

    it('should handle empty reason string', async () => {
      // Given: Request with empty reason
      const mockResult = {
        id: 'grant_empty',
        amount: '25',
        customer_id: 'z1user111',
        grantor_did: 'z1grantor111',
      };

      vi.mocked(paymentClient.creditGrants.create).mockResolvedValue(mockResult as any);

      const requestBody = {
        userId: 'z1user111',
        amount: 25,
        grantorDid: 'z1grantor111',
        reason: '',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should use default reason
      expect(response.body.success).toBe(true);
      expect(paymentClient.creditGrants.create).toHaveBeenCalledWith(
        expect.objectContaining({
          reason: 'Credit grant from AIGNE Hub',
        })
      );
    });
  });

  describe('Validation Cases', () => {
    it('should reject missing userId', async () => {
      // Given: Request without userId
      const requestBody = {
        amount: 100,
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(paymentClient.creditGrants.create).not.toHaveBeenCalled();
    });

    it('should reject missing amount', async () => {
      // Given: Request without amount
      const requestBody = {
        userId: 'z1user123',
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(paymentClient.creditGrants.create).not.toHaveBeenCalled();
    });

    it('should reject negative amounts', async () => {
      // Given: Request with negative amount
      const requestBody = {
        userId: 'z1user123',
        amount: -50,
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(paymentClient.creditGrants.create).not.toHaveBeenCalled();
    });

    it('should reject zero amounts', async () => {
      // Given: Request with zero amount
      const requestBody = {
        userId: 'z1user123',
        amount: 0,
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(paymentClient.creditGrants.create).not.toHaveBeenCalled();
    });

    it('should reject missing grantorDid', async () => {
      // Given: Request without grantorDid
      const requestBody = {
        userId: 'z1user123',
        amount: 100,
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return validation error
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
      expect(paymentClient.creditGrants.create).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should return success:false on payment-kit SDK failure', async () => {
      // Given: Payment client throws error
      vi.mocked(paymentClient.creditGrants.create).mockRejectedValue(new Error('Payment service unavailable'));

      const requestBody = {
        userId: 'z1user123',
        amount: 100,
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return error response without throwing
      expect(response.body).toEqual({
        success: false,
        error: 'Payment service unavailable',
      });
    });

    it('should handle generic errors with fallback message', async () => {
      // Given: Payment client throws error without message
      vi.mocked(paymentClient.creditGrants.create).mockRejectedValue(new Error());

      const requestBody = {
        userId: 'z1user123',
        amount: 100,
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should return fallback error message
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to grant credit. Please try again.');
    });

    it('should not throw errors (silent degradation)', async () => {
      // Given: Multiple error scenarios
      vi.mocked(paymentClient.creditGrants.create).mockRejectedValue(new Error('Network timeout'));

      const requestBody = {
        userId: 'z1user123',
        amount: 100,
        grantorDid: 'z1grantor456',
      };

      // When: POST to /grant endpoint
      const response = await request(app).post('/api/credit/grant').send(requestBody);

      // Then: Should return 200 status (no thrown error)
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Middleware Integration', () => {
    it('should apply verifySiteGroup middleware', async () => {
      // Given: Import verifySiteGroup to check it's applied
      const { verifySiteGroup } = await import('../../../api/src/middlewares/verify-site-group');

      const mockResult = {
        id: 'grant_middleware',
        amount: '10',
        customer_id: 'z1user_mw',
        grantor_did: 'z1grantor_mw',
      };

      vi.mocked(paymentClient.creditGrants.create).mockResolvedValue(mockResult as any);

      const requestBody = {
        userId: 'z1user_mw',
        amount: 10,
        grantorDid: 'z1grantor_mw',
      };

      // When: POST to /grant endpoint
      await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Middleware should be called
      expect(verifySiteGroup).toHaveBeenCalled();
    });

    it('should apply session middleware (user authentication)', async () => {
      // Given: Valid request
      const mockResult = {
        id: 'grant_session',
        amount: '15',
        customer_id: 'z1user_sess',
        grantor_did: 'z1grantor_sess',
      };

      vi.mocked(paymentClient.creditGrants.create).mockResolvedValue(mockResult as any);

      const requestBody = {
        userId: 'z1user_sess',
        amount: 15,
        grantorDid: 'z1grantor_sess',
      };

      // When: POST to /grant endpoint
      await request(app).post('/api/credit/grant').send(requestBody).expect(200);

      // Then: Should include authenticated user's DID in metadata
      expect(paymentClient.creditGrants.create).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            grantedBy: 'z1test-user-did',
          }),
        })
      );
    });
  });
});
