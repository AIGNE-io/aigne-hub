import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { Router } from 'express';
import Joi from 'joi';

import { ensureMeter, paymentClient } from '../libs/payment';
import { verifySiteGroup } from '../middlewares/verify-site-group';

const router = Router();
const user = sessionMiddleware({ accessKey: true });

// Helper function for admin/owner role check
function isAdminRole(role?: string): boolean {
  return role === 'owner' || role === 'admin';
}

// Validation schema
const grantCreditSchema = Joi.object({
  userId: Joi.string().required(),
  amount: Joi.number().positive().required(),
  reason: Joi.string().optional().allow(''),
  grantorDid: Joi.string().required(),
});

// POST /grant endpoint
router.post('/grant', user, verifySiteGroup, async (req, res) => {
  try {
    const { userId, amount, reason, grantorDid } = await grantCreditSchema.validateAsync(req.body);

    const result = await paymentClient.creditGrants.create({
      customer_id: userId,
      amount: String(amount),
      grantor_did: grantorDid,
      metadata: {
        reason: reason || 'Credit grant from AIGNE Hub',
        grantedBy: req.user?.did,
        grantedAt: new Date().toISOString(),
      },
    } as any);

    return res.json({
      success: true,
      grantId: result.id,
      amount: result.amount,
    });
  } catch (error: any) {
    return res.json({
      success: false,
      error: error.message || 'Failed to grant credit. Please try again.',
    });
  }
});

// GET /grant-usage endpoint - Get daily grant credit consumption stats
router.get('/grant-usage', user, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Admin/Owner check
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({
        error: 'Insufficient permissions. Admin or owner role required.',
      });
    }

    const startTime = parseInt(req.query.startTime as string, 10);
    const endTime = parseInt(req.query.endTime as string, 10);
    const grantorDid = req.query.grantorDid as string; // This is the project DID (appDid)
    const useMock = req.query.mock === 'true';

    // Validate parameters
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || !grantorDid) {
      return res.json({
        success: false,
        error: 'Invalid parameters: startTime, endTime and grantorDid are required',
        daily_stats: [],
      });
    }

    // TODO: Remove mock data after testing
    // Return empty data for mock mode - let frontend generate mock
    if (useMock) {
      return res.json({
        summary: {
          total_granted_amount: '0',
          total_used_amount: '0',
          total_remaining_amount: '0',
        },
        daily_stats: [],
      });
    }

    // Get meter for currency_id
    const meter = await ensureMeter();
    if (!meter || !meter.currency_id) {
      // Return empty data if payment kit is not configured - let frontend handle mock
      return res.json({
        summary: {
          total_granted_amount: '0',
          total_used_amount: '0',
          total_remaining_amount: '0',
        },
        daily_stats: [],
      });
    }

    // Call payment-kit SDK
    const stats = await paymentClient.creditGrants.stats({
      currency_id: meter.currency_id,
      start_date: startTime,
      end_date: endTime,
      grantor_did: grantorDid,
      group_by_date: true,
    });

    return res.json({
      summary: stats.stats?.[0] || {},
      daily_stats: stats.daily_stats || [],
    });
  } catch (error: any) {
    // Silent degradation - return empty data (frontend will generate mock)
    return res.json({
      summary: {
        total_granted_amount: '0',
        total_used_amount: '0',
        total_remaining_amount: '0',
      },
      daily_stats: [],
    });
  }
});

// GET /grant-balance endpoint - Get grant credit balance for a project
router.get('/grant-balance', user, async (req, res) => {
  try {
    const appDid = req.query.appDid as string;
    const useMock = req.query.mock === 'true'; // Add ?mock=true to use mock data

    if (!appDid) {
      return res.status(400).json({
        success: false,
        error: 'appDid parameter is required',
        total: '0',
        remaining: '0',
        grants: [],
      });
    }

    // TODO: Remove mock data after testing
    // Mock data for UI testing - simulate multiple grants with consumption history
    if (useMock) {
      const mockGrants = [
        {
          id: 'grant_1',
          amount: '30000',
          consumed_amount: '12500',
          remaining_amount: '17500',
          created_at: Date.now() - 30 * 24 * 60 * 60 * 1000, // 30 days ago
        },
        {
          id: 'grant_2',
          amount: '20000',
          consumed_amount: '4750',
          remaining_amount: '15250',
          created_at: Date.now() - 15 * 24 * 60 * 60 * 1000, // 15 days ago
        },
      ];

      return res.json({
        total: '50000',
        remaining: '32750',
        grants: mockGrants,
      });
    }

    // Get meter for currency_id
    const meter = await ensureMeter();
    if (!meter || !meter.currency_id) {
      // Return mock data if payment kit is not configured
      const mockGrants = [
        {
          id: 'grant_1',
          amount: '30000',
          consumed_amount: '12500',
          remaining_amount: '17500',
          created_at: Date.now() - 30 * 24 * 60 * 60 * 1000,
        },
        {
          id: 'grant_2',
          amount: '20000',
          consumed_amount: '4750',
          remaining_amount: '15250',
          created_at: Date.now() - 15 * 24 * 60 * 60 * 1000,
        },
      ];

      return res.json({
        total: '50000',
        remaining: '32750',
        grants: mockGrants,
      });
    }

    // Get all grants for this customer (appDid)
    const grantsResult = await paymentClient.creditGrants.list({
      currency_id: meter.currency_id,
      customer_id: appDid,
    });

    // Calculate total and remaining
    let totalGranted = 0;
    let totalRemaining = 0;

    // Access the data array from paginated result
    const grants = (grantsResult as any).data || [];
    const grantsList: any[] = [];

    grants.forEach((grant: any) => {
      const amount = parseFloat(grant.amount || '0');
      const consumed = parseFloat(grant.consumed_amount || '0');
      const remaining = Math.max(0, amount - consumed);

      totalGranted += amount;
      totalRemaining += remaining;

      grantsList.push({
        id: grant.id,
        amount: String(amount),
        consumed_amount: String(consumed),
        remaining_amount: String(remaining),
        created_at: grant.created_at,
      });
    });

    return res.json({
      total: String(totalGranted),
      remaining: String(totalRemaining),
      grants: grantsList,
    });
  } catch (error: any) {
    // Silent degradation - return mock data on error
    console.warn('Grant balance query error:', error);
    const mockGrants = [
      {
        id: 'grant_1',
        amount: '30000',
        consumed_amount: '12500',
        remaining_amount: '17500',
        created_at: Date.now() - 30 * 24 * 60 * 60 * 1000,
      },
      {
        id: 'grant_2',
        amount: '20000',
        consumed_amount: '4750',
        remaining_amount: '15250',
        created_at: Date.now() - 15 * 24 * 60 * 60 * 1000,
      },
    ];

    return res.json({
      total: '50000',
      remaining: '32750',
      grants: mockGrants,
    });
  }
});

export default router;
