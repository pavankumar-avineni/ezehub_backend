import prisma from '../config/database.js';
import { cacheWrap, cacheDel } from '../utils/cache.js';
import { NotFoundError, ConflictError, ValidationError, FeatureNotEnabledError } from '../utils/errors.js';
import {
  FEATURES, FEATURE_BY_CODE, FEATURE_CODES, CORE_FEATURE_CODES, ADDON_FEATURE_CODES, FEATURE_PRICE_LIMITS,
} from '../constants/features.js';
import { parsePagination } from '../utils/response.js';

const num = (v) => (v === null || v === undefined ? null : Number(v));
const enabledCacheKey = (tenantId) => `features:enabled:${tenantId}`;
const ENABLED_CACHE_TTL = 30;

/**
 * Feature catalog + per-tenant feature assignment.
 *
 *  - Core features are always on and never priced.
 *  - Add-ons are switched on per tenant by the platform. A tenant without an add-on gets a
 *    403 FEATURE_NOT_ENABLED on its APIs. Its data is kept, and switching the add-on back on restores access.
 *  - Price: tenant custom price if set, otherwise the catalog price.
 *      PER_BED = price x billable beds per month, FLAT = price per month.
 */
class FeatureService {
  constructor() {
    this._ensured = false;
  }

  // ─── catalog ──────────────────────────────────────────────────

  /** Make sure every feature in code exists in the database. Never overwrites prices. */
  async ensureCatalog(force = false) {
    if (this._ensured && !force) return;
    for (const f of FEATURES) {
      await prisma.feature.upsert({
        where: { code: f.code },
        update: { group: f.group, isCore: f.isCore, sortOrder: f.sortOrder },
        create: {
          code: f.code, name: f.name, description: f.description, group: f.group,
          isCore: f.isCore, sortOrder: f.sortOrder, price: 0, priceType: 'PER_BED',
        },
      });
    }
    this._ensured = true;
  }

  _format(feature, extra = {}) {
    const meta = FEATURE_BY_CODE[feature.code] || {};
    return {
      code: feature.code,
      name: feature.name,
      description: feature.description,
      group: feature.group,
      isCore: feature.isCore,
      price: feature.isCore ? 0 : num(feature.price),
      priceType: feature.priceType,
      isActive: feature.isActive,
      requires: meta.requires || [],
      ...extra,
    };
  }

  /** Public catalog (pricing page): active features with their default price. */
  async getPublicCatalog() {
    await this.ensureCatalog();
    const rows = await prisma.feature.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    return rows.map((f) => this._format(f));
  }

  /** Platform catalog: every feature, with how many tenants use it. */
  async getCatalog() {
    await this.ensureCatalog();
    const [rows, usage] = await Promise.all([
      prisma.feature.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.tenantFeature.groupBy({ by: ['featureId'], where: { isEnabled: true }, _count: { _all: true } }),
    ]);
    const used = new Map(usage.map((u) => [u.featureId, u._count._all]));
    const tenants = await prisma.tenant.count({ where: { deletedAt: null } });
    return rows.map((f) => this._format(f, { tenantsUsing: f.isCore ? tenants : (used.get(f.id) || 0) }));
  }

  /** Change price / price type / name / availability of a catalog feature. Affects NEW invoices only. */
  async updateCatalogFeature(code, data, changedBy) {
    await this.ensureCatalog();
    const feature = await prisma.feature.findUnique({ where: { code } });
    if (!feature) throw new NotFoundError('Feature');

    const { reason, ...fields } = data;
    if (feature.isCore && (fields.price !== undefined || fields.priceType !== undefined || fields.isActive !== undefined)) {
      throw new ConflictError('Core features are included in the per-bed rate. Only the name and description can be edited');
    }

    const patch = {};
    for (const k of ['name', 'description', 'price', 'priceType', 'isActive']) {
      if (fields[k] !== undefined) patch[k] = fields[k];
    }
    const changed = Object.entries(patch).filter(([k, v]) => {
      const cur = feature[k];
      return (k === 'price' ? Number(cur) !== v : cur !== v);
    });
    if (!changed.length) throw new ConflictError('Nothing to change');

    let customPricesCleared = 0;
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.feature.update({ where: { code }, data: patch });

      // A custom price only makes sense for the price type it was set for.
      if (patch.priceType && patch.priceType !== feature.priceType) {
        const rows = await tx.tenantFeature.findMany({ where: { featureId: feature.id, customPrice: { not: null } } });
        for (const r of rows) {
          await tx.tenantFeature.update({ where: { id: r.id }, data: { customPrice: null } });
          await tx.featureChangeLog.create({
            data: {
              tenantId: r.tenantId, featureCode: code, action: 'PRICE_RESET',
              oldValue: { customPrice: num(r.customPrice) }, newValue: { customPrice: null },
              reason: 'Catalog price type changed, custom price cleared', changedBy,
            },
          });
        }
        customPricesCleared = rows.length;
      }

      await tx.featureChangeLog.create({
        data: {
          tenantId: null, featureCode: code, action: 'CATALOG_UPDATED',
          oldValue: Object.fromEntries(changed.map(([k]) => [k, k === 'price' ? num(feature[k]) : feature[k]])),
          newValue: Object.fromEntries(changed.map(([k, v]) => [k, v])),
          reason: reason || null, changedBy,
        },
      });
      return updated;
    });

    await this._invalidateAll();
    return this._format(result, { customPricesCleared });
  }

  // ─── per-tenant state ─────────────────────────────────────────

  /** Codes of every feature the tenant can use: core + enabled add-ons. Cached for 30s. */
  async getEnabledCodes(tenantId) {
    return cacheWrap(enabledCacheKey(tenantId), ENABLED_CACHE_TTL, async () => {
      const rows = await prisma.tenantFeature.findMany({
        where: { tenantId, isEnabled: true },
        select: { feature: { select: { code: true } } },
      });
      return [...CORE_FEATURE_CODES, ...rows.map((r) => r.feature.code)];
    });
  }

  async isEnabled(tenantId, code) {
    return (await this.getEnabledCodes(tenantId)).includes(code);
  }

  async assertEnabled(tenantId, code) {
    if (!(await this.isEnabled(tenantId, code))) {
      throw new FeatureNotEnabledError(code, FEATURE_BY_CODE[code]?.name);
    }
  }

  /** Enabled add-ons with their effective price, for one tenant or for several (Map tenantId -> list). */
  async getBillableFeaturesByTenant(tenantIds = null) {
    if (Array.isArray(tenantIds) && tenantIds.length === 0) return new Map();
    const rows = await prisma.tenantFeature.findMany({
      where: { isEnabled: true, ...(tenantIds && { tenantId: { in: tenantIds } }), feature: { isCore: false } },
      include: { feature: true },
      orderBy: { feature: { sortOrder: 'asc' } },
    });
    const map = new Map();
    for (const r of rows) {
      const price = r.customPrice !== null ? Number(r.customPrice) : Number(r.feature.price);
      const item = {
        code: r.feature.code, name: r.feature.name, priceType: r.feature.priceType,
        price, isCustomPrice: r.customPrice !== null,
      };
      if (!map.has(r.tenantId)) map.set(r.tenantId, []);
      map.get(r.tenantId).push(item);
    }
    return map;
  }

  async getBillableFeatures(tenantId) {
    return (await this.getBillableFeaturesByTenant([tenantId])).get(tenantId) || [];
  }

  /** Full feature list for one tenant: core + every add-on, with state and price. */
  async getTenantFeatures(tenantId, { beds = null, historyLimit = 20 } = {}) {
    await this.ensureCatalog();
    const [catalog, rows, history] = await Promise.all([
      prisma.feature.findMany({ orderBy: { sortOrder: 'asc' } }),
      prisma.tenantFeature.findMany({ where: { tenantId } }),
      prisma.featureChangeLog.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: historyLimit }),
    ]);
    const byFeature = new Map(rows.map((r) => [r.featureId, r]));

    const features = catalog.map((f) => {
      const row = byFeature.get(f.id);
      const enabled = f.isCore || Boolean(row?.isEnabled);
      const customPrice = row && row.customPrice !== null ? Number(row.customPrice) : null;
      const effectivePrice = f.isCore ? 0 : (customPrice !== null ? customPrice : Number(f.price));
      let monthlyCost = null;
      if (enabled && !f.isCore && (f.priceType === 'FLAT' || beds !== null)) {
        monthlyCost = f.priceType === 'FLAT' ? effectivePrice : Math.round(effectivePrice * beds * 100) / 100;
      }
      return this._format(f, {
        enabled,
        isIncluded: f.isCore,
        catalogPrice: f.isCore ? 0 : num(f.price),
        customPrice,
        isCustomPrice: customPrice !== null,
        effectivePrice,
        monthlyCost,
        enabledAt: row?.isEnabled ? row.enabledAt : null,
        disabledAt: row && !row.isEnabled ? row.disabledAt : null,
        canBeEnabled: !f.isCore && f.isActive,
      });
    });

    return {
      features,
      enabledCodes: features.filter((f) => f.enabled).map((f) => f.code),
      summary: {
        core: features.filter((f) => f.isCore).length,
        addOnsEnabled: features.filter((f) => !f.isCore && f.enabled).length,
        addOnsAvailable: features.filter((f) => !f.isCore).length,
      },
      history: history.map((h) => ({
        id: h.id, featureCode: h.featureCode, action: h.action, oldValue: h.oldValue, newValue: h.newValue,
        reason: h.reason, changedBy: h.changedBy, createdAt: h.createdAt,
      })),
    };
  }

  // ─── assigning features ───────────────────────────────────────

  _validateCodes(codes) {
    const unknown = codes.filter((c) => !FEATURE_CODES.includes(c));
    if (unknown.length) throw new ValidationError(`Unknown feature code(s): ${unknown.join(', ')}`);
  }

  /** Every selected feature must also have what it requires. */
  _checkDependencies(addons) {
    const set = new Set(addons);
    const problems = [];
    for (const code of set) {
      for (const need of FEATURE_BY_CODE[code]?.requires || []) {
        if (!set.has(need) && !CORE_FEATURE_CODES.includes(need)) {
          problems.push(`${FEATURE_BY_CODE[code].name} needs ${FEATURE_BY_CODE[need].name}`);
        }
      }
    }
    if (problems.length) throw new ValidationError(`Feature dependency problem: ${problems.join('; ')}`);
  }

  /**
   * Make the tenant's add-on set exactly `codes` (core codes are ignored, they are always on).
   * Works inside a caller transaction when `db` is a transaction client.
   */
  async applySet(db, tenantId, codes, changedBy, reason = null) {
    await this.ensureCatalog();
    this._validateCodes(codes);
    const desired = new Set(codes.filter((c) => ADDON_FEATURE_CODES.includes(c)));
    this._checkDependencies(desired);

    const [catalog, existing] = await Promise.all([
      db.feature.findMany({ where: { isCore: false } }),
      db.tenantFeature.findMany({ where: { tenantId } }),
    ]);
    const byFeature = new Map(existing.map((r) => [r.featureId, r]));

    const enabled = [];
    const disabled = [];
    for (const f of catalog) {
      const row = byFeature.get(f.id);
      const want = desired.has(f.code);
      if (want && (!row || !row.isEnabled)) {
        if (!f.isActive) throw new ValidationError(`The "${f.name}" feature is not available for new assignments`);
        if (row) {
          await db.tenantFeature.update({ where: { id: row.id }, data: { isEnabled: true, enabledAt: new Date(), disabledAt: null, enabledBy: changedBy } });
        } else {
          await db.tenantFeature.create({ data: { tenantId, featureId: f.id, enabledBy: changedBy } });
        }
        enabled.push(f.code);
      } else if (!want && row?.isEnabled) {
        await db.tenantFeature.update({ where: { id: row.id }, data: { isEnabled: false, disabledAt: new Date() } });
        disabled.push(f.code);
      }
    }

    const logs = [
      ...enabled.map((code) => ({ tenantId, featureCode: code, action: 'ENABLED', reason, changedBy })),
      ...disabled.map((code) => ({ tenantId, featureCode: code, action: 'DISABLED', reason, changedBy })),
    ];
    if (logs.length) await db.featureChangeLog.createMany({ data: logs });
    return { enabled, disabled };
  }

  async _assertTenant(tenantId) {
    const tenant = await prisma.tenant.findFirst({ where: { id: tenantId, deletedAt: null }, select: { id: true } });
    if (!tenant) throw new NotFoundError('Tenant');
  }

  async _currentAddons(tenantId) {
    const codes = await this.getEnabledCodesFresh(tenantId);
    return codes.filter((c) => ADDON_FEATURE_CODES.includes(c));
  }

  async getEnabledCodesFresh(tenantId) {
    await cacheDel(enabledCacheKey(tenantId));
    return this.getEnabledCodes(tenantId);
  }

  async setTenantFeatures(tenantId, codes, { reason } = {}, changedBy) {
    await this._assertTenant(tenantId);
    const result = await prisma.$transaction((tx) => this.applySet(tx, tenantId, codes, changedBy, reason || null));
    await cacheDel(enabledCacheKey(tenantId));
    return { ...result, ...(await this.getTenantFeatures(tenantId)) };
  }

  async enableFeature(tenantId, code, { reason } = {}, changedBy) {
    await this._assertTenant(tenantId);
    this._validateCodes([code]);
    if (CORE_FEATURE_CODES.includes(code)) throw new ConflictError('Core features are always enabled');
    const current = await this._currentAddons(tenantId);
    if (current.includes(code)) throw new ConflictError('This feature is already enabled');
    return this.setTenantFeatures(tenantId, [...current, code], { reason }, changedBy);
  }

  async disableFeature(tenantId, code, { reason } = {}, changedBy) {
    await this._assertTenant(tenantId);
    this._validateCodes([code]);
    if (CORE_FEATURE_CODES.includes(code)) throw new ConflictError('Core features cannot be disabled');
    const current = await this._currentAddons(tenantId);
    if (!current.includes(code)) throw new ConflictError('This feature is not enabled');
    return this.setTenantFeatures(tenantId, current.filter((c) => c !== code), { reason }, changedBy);
  }

  /** Give one tenant a special price for one feature, or send useCatalogPrice to go back to the catalog price. */
  async setTenantFeaturePrice(tenantId, code, { price, useCatalogPrice, reason }, changedBy) {
    await this._assertTenant(tenantId);
    this._validateCodes([code]);
    const feature = await prisma.feature.findUnique({ where: { code } });
    if (!feature) throw new NotFoundError('Feature');
    if (feature.isCore) throw new ConflictError('Core features are included in the per-bed rate and have no price');

    const row = await prisma.tenantFeature.findUnique({ where: { tenantId_featureId: { tenantId, featureId: feature.id } } });
    if (!row) throw new ConflictError('Enable this feature for the tenant before setting a price');

    const newCustom = useCatalogPrice ? null : price;
    const oldEffective = row.customPrice !== null ? Number(row.customPrice) : Number(feature.price);
    const newEffective = newCustom !== null ? newCustom : Number(feature.price);
    if ((row.customPrice === null ? null : Number(row.customPrice)) === newCustom) {
      throw new ConflictError('The tenant already has this price');
    }

    await prisma.$transaction(async (tx) => {
      await tx.tenantFeature.update({ where: { id: row.id }, data: { customPrice: newCustom } });
      await tx.featureChangeLog.create({
        data: {
          tenantId, featureCode: code, action: newCustom === null ? 'PRICE_RESET' : 'PRICE_SET',
          oldValue: { effectivePrice: oldEffective, customPrice: num(row.customPrice) },
          newValue: { effectivePrice: newEffective, customPrice: newCustom },
          reason: reason || (newCustom === null ? 'Back to catalog price' : null), changedBy,
        },
      });
    });
    await cacheDel(enabledCacheKey(tenantId));
    return this.getTenantFeatures(tenantId);
  }

  async getHistory(query) {
    const { page, limit, skip } = parsePagination(query);
    const where = {};
    if (query.tenantId) where.tenantId = query.tenantId;
    if (query.featureCode) where.featureCode = query.featureCode;
    if (query.scope === 'catalog') where.tenantId = null;
    const [rows, total] = await Promise.all([
      prisma.featureChangeLog.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.featureChangeLog.count({ where }),
    ]);
    return { history: rows, pagination: { page, limit, total } };
  }

  /** Cache keys are per tenant, so a catalog-level change clears them all. */
  async _invalidateAll() {
    const ids = await prisma.tenant.findMany({ select: { id: true } });
    await cacheDel(...ids.map((t) => enabledCacheKey(t.id)));
  }
}

export default new FeatureService();
