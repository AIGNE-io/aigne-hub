import { auth } from '@blocklet/sdk/lib/middlewares';
import { sessionMiddleware } from '@blocklet/sdk/lib/middlewares/session';
import { Router } from 'express';
import Joi from 'joi';

import { ensureMeter, paymentClient } from '../libs/payment';
import { ensureAdmin } from '../libs/security';

const router = Router();
const user = sessionMiddleware({ accessKey: true });
const accessKeyAdmin = auth({ roles: ['admin', 'owner'], methods: ['accessKey'] });

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

// POST /grant endpoint (admin/owner access key only)
router.post('/grant', user, accessKeyAdmin, async (req, res) => {
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
router.get('/grant-usage', user, ensureAdmin, async (req, res) => {
  try {
    const userDid = req.user?.did;
    if (!userDid) {
      return res.status(401).json({ error: 'Unauthorized' });
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
    // @ts-ignore
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

export default router;
