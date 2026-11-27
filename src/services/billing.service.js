import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.js';
import { BILLING_DEFAULTS } from '../constants/index.js';
import { ADDON_FEATURE_CODES } from '../constants/features.js';
import featureService from './feature.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const num = (v) => (v === null || v === undefined ? null : Number(v));
const toPaise = (rupees) => Math.round(Number(rupees) * 100);
const fromPaise = (paise) => paise / 100;

/**
 * Per-bed billing rules in one place.
 *
 * - A "billable bed" is every bed that exists in the tenant's live structure:
 *   the bed, its room, its floor and its building must all be non-deleted.
 *   Empty and occupied beds both count. Inactive beds count too.
 * - Money is calculated in paise (integers) so there are no floating point errors.
 * - A rate or tax change only affects invoices created afterwards.
 */
class BillingService {
  // ─── settings ─────────────────────────────────────────────────

  async getSettings(db = prisma) {
    const row = await db.billingSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: {
        id: 'default',
        defaultRatePerBed: BILLING_DEFAULTS.RATE_PER_BED,
        trialDays: BILLING_DEFAULTS.TRIAL_DAYS,
        taxPercent: BILLING_DEFAULTS.TAX_PERCENT,
      },
    });
    return this._formatSettings(row);
  }

  _formatSettings(row) {
    return {
      defaultRatePerBed: num(row.defaultRatePerBed),
      trialDays: row.trialDays,
      taxPercent: num(row.taxPercent),
      defaultFeatures: row.defaultFeatures || [],
      currency: 'INR',
      billingPeriodDays: BILLING_DEFAULTS.BILLING_PERIOD_DAYS,
      updatedBy: row.updatedBy,
      updatedAt: row.updatedAt,
    };
  }

  /**
   * Update platform defaults. `applyToExistingTenants` re-prices every tenant that is on
   * the default rate (tenants with a custom rate are never touched).
   */
  async updateSettings(data, changedBy) {
    const { applyToExistingTenants, ...fields } = data;
    const current = await this.getSettings();

    if (fields.defaultFeatures) {
      const unique = [...new Set(fields.defaultFeatures)];
      const bad = unique.filter((c) => !ADDON_FEATURE_CODES.includes(c));
      if (bad.length) throw new ValidationError(`Not an add-on feature code: ${bad.join(', ')}. Core features are always on`);
      featureService._checkDependencies(unique);
      fields.defaultFeatures = unique;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.billingSettings.update({
        where: { id: 'default' },
        data: { ...fields, updatedBy: changedBy },
      });

      const newRate = fields.defaultRatePerBed;
      let repriced = 0;
      if (applyToExistingTenants && newRate !== undefined && newRate !== current.defaultRatePerBed) {
        const subs = await tx.subscription.findMany({
          where: { isCustomRate: false, NOT: { ratePerBed: newRate } },
          select: { id: true, tenantId: true, ratePerBed: true },
        });
        for (const sub of subs) {
          await tx.subscription.update({ where: { id: sub.id }, data: { ratePerBed: newRate } });
        }
        if (subs.length) {
          await tx.subscriptionRateHistory.createMany({
            data: subs.map((s) => ({
              tenantId: s.tenantId,
              subscriptionId: s.id,
              oldRate: s.ratePerBed,
              newRate,
              isCustomRate: false,
              reason: 'Platform default rate changed',
              changedBy,
            })),
          });
        }
        repriced = subs.length;
      }
      return { row, repriced };
    });

    return { ...this._formatSettings(updated.row), tenantsRepriced: updated.repriced };
  }

  // ─── bed counting ─────────────────────────────────────────────

  /** Billable beds per building for one tenant. */
  async getBedBreakdown(tenantId, db = prisma) {
    const rows = await db.$queryRaw`
      SELECT bl.id AS "buildingId", bl.name AS "buildingName", COUNT(b.id)::int AS "beds"
      FROM beds b
      JOIN rooms r ON r.id = b.room_id AND r.deleted_at IS NULL
      JOIN floors f ON f.id = r.floor_id AND f.deleted_at IS NULL
      JOIN buildings bl ON bl.id = f.building_id AND bl.deleted_at IS NULL
      WHERE b.tenant_id = ${tenantId} AND b.deleted_at IS NULL
      GROUP BY bl.id, bl.name
      ORDER BY bl.name`;
    return rows;
  }

  async countBillableBeds(tenantId, db = prisma) {
    const breakdown = await this.getBedBreakdown(tenantId, db);
    return breakdown.reduce((sum, b) => sum + b.beds, 0);
  }

  /** Map of tenantId -> billable bed count. Pass tenantIds to limit the query. */
  async countBillableBedsByTenant(tenantIds = null) {
    if (Array.isArray(tenantIds) && tenantIds.length === 0) return new Map();
    const filter = tenantIds ? Prisma.sql`AND b.tenant_id IN (${Prisma.join(tenantIds)})` : Prisma.empty;
    const rows = await prisma.$queryRaw`
      SELECT b.tenant_id AS "tenantId", COUNT(b.id)::int AS "beds"
      FROM beds b
      JOIN rooms r ON r.id = b.room_id AND r.deleted_at IS NULL
      JOIN floors f ON f.id = r.floor_id AND f.deleted_at IS NULL
      JOIN buildings bl ON bl.id = f.building_id AND bl.deleted_at IS NULL
      WHERE b.deleted_at IS NULL ${filter}
      GROUP BY b.tenant_id`;
    return new Map(rows.map((r) => [r.tenantId, r.beds]));
  }

  // ─── money ────────────────────────────────────────────────────

  /** amount = beds x rate, tax = amount x tax%, all rounded to paise. */
  computeCharge(beds, ratePerBed, taxPercent = 0) {
    const amountPaise = beds * toPaise(ratePerBed);
    const taxPaise = Math.round((amountPaise * Number(taxPercent)) / 100);
    return {
      beds,
      ratePerBed: Number(ratePerBed),
      taxPercent: Number(taxPercent),
      amount: fromPaise(amountPaise),
      tax: fromPaise(taxPaise),
      total: fromPaise(amountPaise + taxPaise),
    };
  }

  /**
   * Full invoice: beds line + one line per priced add-on feature.
   * PER_BED features cost price x beds, FLAT features cost price once. Features priced at 0 add no line.
   */
  computeInvoice(beds, ratePerBed, taxPercent = 0, features = []) {
    const bedsPaise = beds * toPaise(ratePerBed);
    const lines = [{
      type: 'BEDS', code: 'BEDS', name: 'Beds', priceType: 'PER_BED',
      quantity: beds, unitPrice: Number(ratePerBed), amount: fromPaise(bedsPaise),
    }];

    let featuresPaise = 0;
    for (const f of features) {
      const unit = toPaise(f.price);
      const paise = f.priceType === 'FLAT' ? unit : beds * unit;
      if (paise <= 0) continue;
      featuresPaise += paise;
      lines.push({
        type: 'FEATURE', code: f.code, name: f.name, priceType: f.priceType,
        quantity: f.priceType === 'FLAT' ? 1 : beds, unitPrice: f.price, amount: fromPaise(paise),
      });
    }

    const amountPaise = bedsPaise + featuresPaise;
    const taxPaise = Math.round((amountPaise * Number(taxPercent)) / 100);
    return {
      beds,
      ratePerBed: Number(ratePerBed),
      taxPercent: Number(taxPercent),
      bedsAmount: fromPaise(bedsPaise),
      featuresAmount: fromPaise(featuresPaise),
      amount: fromPaise(amountPaise),
      tax: fromPaise(taxPaise),
      total: fromPaise(amountPaise + taxPaise),
      lines,
    };
  }

  // ─── trial helpers ────────────────────────────────────────────

  trialInfo(sub, now = new Date()) {
    const isTrial = sub.status === 'TRIAL';
    const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    const trialDaysLeft = isTrial && trialEndsAt ? Math.max(0, Math.ceil((trialEndsAt - now) / DAY_MS)) : 0;
    return {
      isTrial,
      trialEndsAt,
      trialDaysLeft,
      trialEnded: isTrial && trialEndsAt ? trialEndsAt <= now : false,
    };
  }

  /** Data for a brand-new subscription. `trialDays` / `ratePerBed` override the platform defaults. */
  async buildNewSubscription({ trialDays, ratePerBed } = {}, db = prisma, now = new Date()) {
    const settings = await this.getSettings(db);
    const days = trialDays ?? settings.trialDays;
    const hasCustomRate = ratePerBed !== undefined && ratePerBed !== null;
    const rate = hasCustomRate ? ratePerBed : settings.defaultRatePerBed;

    const base = { ratePerBed: rate, isCustomRate: hasCustomRate, startDate: now };
    if (days > 0) {
      const trialEndsAt = new Date(now.getTime() + days * DAY_MS);
      return { ...base, status: 'TRIAL', trialEndsAt, endDate: trialEndsAt };
    }
    // No trial: the first invoice is due straight away.
    return { ...base, status: 'ACTIVE', trialEndsAt: null, endDate: now };
  }

  // ─── tenant pricing view ──────────────────────────────────────

  async getTenantPricing(tenantId, { historyLimit = 50 } = {}) {
    const tenant = await prisma.tenant.findFirst({
      where: { id: tenantId, deletedAt: null },
      include: { subscription: true },
    });
    if (!tenant) throw new NotFoundError('Tenant');
    if (!tenant.subscription) throw new NotFoundError('Subscription');

    const sub = tenant.subscription;
    const [settings, breakdown, history, features] = await Promise.all([
      this.getSettings(),
      this.getBedBreakdown(tenantId),
      prisma.subscriptionRateHistory.findMany({
        where: { tenantId }, orderBy: { createdAt: 'desc' }, take: historyLimit,
      }),
      featureService.getBillableFeatures(tenantId),
    ]);
    const beds = breakdown.reduce((s, b) => s + b.beds, 0);

    return {
      tenant: { id: tenant.id, name: tenant.name, status: tenant.status },
      subscription: this.formatSubscription(sub, settings),
      billableBeds: beds,
      bedsByBuilding: breakdown,
      enabledAddOns: features.map((f) => f.code),
      estimatedNextInvoice: this.computeInvoice(beds, sub.ratePerBed, settings.taxPercent, features),
      platformDefaults: { defaultRatePerBed: settings.defaultRatePerBed, trialDays: settings.trialDays, taxPercent: settings.taxPercent, defaultFeatures: settings.defaultFeatures },
      rateHistory: history.map((h) => ({
        id: h.id, oldRate: num(h.oldRate), newRate: num(h.newRate), isCustomRate: h.isCustomRate,
        reason: h.reason, changedBy: h.changedBy, createdAt: h.createdAt,
      })),
    };
  }

  formatSubscription(sub, settings = null) {
    const now = new Date();
    const endDate = sub.endDate ? new Date(sub.endDate) : null;
    return {
      id: sub.id,
      status: sub.status,
      ratePerBed: num(sub.ratePerBed),
      isCustomRate: sub.isCustomRate,
      defaultRatePerBed: settings ? settings.defaultRatePerBed : undefined,
      billingCycle: sub.billingCycle,
      startDate: sub.startDate,
      endDate: sub.endDate,
      daysLeft: endDate ? Math.max(0, Math.ceil((endDate - now) / DAY_MS)) : 0,
      isExpired: endDate ? endDate < now : false,
      ...this.trialInfo(sub, now),
    };
  }

  // ─── platform controls (super admin) ──────────────────────────

  async _getSubscription(tenantId, db = prisma) {
    const sub = await db.subscription.findUnique({ where: { tenantId } });
    if (!sub) throw new NotFoundError('Subscription');
    return sub;
  }

  /** Set a custom per-bed rate for one tenant, or send `useDefault` to follow the platform default again. */
  async setTenantRate(tenantId, { ratePerBed, useDefault, reason }, changedBy) {
    await this._assertTenantExists(tenantId);
    const settings = await this.getSettings();

    await prisma.$transaction(async (tx) => {
      const sub = await this._getSubscription(tenantId, tx);
      const newRate = useDefault ? settings.defaultRatePerBed : ratePerBed;
      const newCustom = !useDefault;

      if (num(sub.ratePerBed) === newRate && sub.isCustomRate === newCustom) {
        throw new ConflictError('The tenant already has this rate');
      }

      await tx.subscription.update({ where: { id: sub.id }, data: { ratePerBed: newRate, isCustomRate: newCustom } });
      await tx.subscriptionRateHistory.create({
        data: {
          tenantId,
          subscriptionId: sub.id,
          oldRate: sub.ratePerBed,
          newRate,
          isCustomRate: newCustom,
          reason: reason || (useDefault ? 'Reset to platform default' : null),
          changedBy,
        },
      });
    });

    return this.getTenantPricing(tenantId, { historyLimit: 10 });
  }

  /** Change when a tenant's free trial ends. Only for tenants that have not paid yet. */
  async setTenantTrial(tenantId, { trialEndsAt, extendDays }) {
    await this._assertTenantExists(tenantId);
    const sub = await this._getSubscription(tenantId);
    if (sub.status !== 'TRIAL') throw new ConflictError('This tenant is not on a free trial');

    const now = new Date();
    let newEnd;
    if (extendDays !== undefined) {
      const from = sub.trialEndsAt && new Date(sub.trialEndsAt) > now ? new Date(sub.trialEndsAt) : now;
      newEnd = new Date(from.getTime() + extendDays * DAY_MS);
    } else {
      newEnd = new Date(trialEndsAt);
    }

    const limit = new Date(now.getTime() + BILLING_DEFAULTS.MAX_TRIAL_DAYS * DAY_MS);
    if (newEnd > limit) throw new ValidationError(`Trial cannot end more than ${BILLING_DEFAULTS.MAX_TRIAL_DAYS} days from today`);

    await prisma.subscription.update({ where: { id: sub.id }, data: { trialEndsAt: newEnd, endDate: newEnd } });
    return this.getTenantPricing(tenantId, { historyLimit: 10 });
  }

  async _assertTenantExists(tenantId) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { id: true } });
    if (!tenant) throw new NotFoundError('Tenant');
  }
}

export default new BillingService();
