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

function parseTimezoneOffset(value: any): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const emptyGrantSummary = {
  total_granted: '0',
  total_consumed: '0',
  total_remaining: '0',
};

const normalizeGrantSummary = (summary?: any) => {
  if (!summary) return {};
  return {
    ...summary,
    total_granted: summary.total_granted ?? summary.total_granted_amount ?? '0',
    total_consumed: summary.total_consumed ?? summary.total_used ?? summary.total_used_amount ?? '0',
    total_remaining: summary.total_remaining ?? summary.total_remaining_amount ?? '0',
  };
};

const normalizeGrantDailyStats = (stats?: any[]) => {
  if (!Array.isArray(stats)) return [];
  return stats.map((stat) => ({
    ...stat,
    total_granted: stat.total_granted ?? stat.granted_amount ?? '0',
    total_consumed: stat.total_consumed ?? stat.used_amount ?? stat.total_used ?? '0',
    total_remaining: stat.total_remaining ?? stat.remaining_amount ?? '0',
  }));
};

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

    // Get meter for currency_id
    const meter = await ensureMeter();
    if (!meter || !meter.currency_id) {
      return res.json({
        success: false,
        error: 'Payment kit is not configured',
      });
    }

    const result = await paymentClient.creditGrants.create({
      customer_id: userId,
      currency_id: meter.currency_id,
      amount: String(amount),
      category: 'promotional',
      granted_by: grantorDid,
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
    const grantorDid = req.query.grantorDid as string | undefined; // Optional: project DID (appDid)
    const timezoneOffset = parseTimezoneOffset(req.query.timezoneOffset);

    // Validate parameters
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
      return res.json({
        success: false,
        error: 'Invalid parameters: startTime and endTime are required',
        summary: emptyGrantSummary,
        daily_stats: [],
      });
    }

    // Get meter for currency_id
    const meter = await ensureMeter();
    if (!meter || !meter.currency_id) {
      // Return empty data if payment kit is not configured
      return res.json({
        summary: emptyGrantSummary,
        daily_stats: [],
      });
    }

    // Call payment-kit SDK
    const stats = await paymentClient.creditGrants.stats({
      currency_id: meter.currency_id,
      start_date: startTime,
      end_date: endTime,
      ...(grantorDid && { granted_by: grantorDid }),
      ...(timezoneOffset !== undefined && { timezoneOffset }),
    });

    return res.json({
      summary: normalizeGrantSummary(stats.stats?.[0]),
      daily_stats: normalizeGrantDailyStats(stats.daily_stats),
    });
  } catch (error: any) {
    // Silent degradation - return empty data (frontend will generate mock)
    return res.json({
      summary: emptyGrantSummary,
      daily_stats: [],
    });
  }
});

// GET /grant-balance endpoint - Get grant credit balance for a project
router.get('/grant-balance', user, async (req, res) => {
  try {
    const appDid = req.query.appDid as string;

    if (!appDid) {
      return res.status(400).json({
        success: false,
        error: 'appDid parameter is required',
        total: '0',
        remaining: '0',
        grants: [],
      });
    }

    // Get meter for currency_id
    const meter = await ensureMeter();
    if (!meter || !meter.currency_id) {
      // Return empty data if payment kit is not configured
      return res.json({
        total: '0',
        remaining: '0',
        grants: [],
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
    // Silent degradation - return empty data on error
    console.warn('Grant balance query error:', error);
    return res.json({
      total: '0',
      remaining: '0',
      grants: [],
    });
  }
});

export default router;
