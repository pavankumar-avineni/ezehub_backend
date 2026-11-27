import prisma from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, getTokenExpiry } from '../utils/jwt.js';
import { UnauthorizedError, NotFoundError, ValidationError } from '../utils/errors.js';
import featureService from './feature.service.js';
import activityService from './activity.service.js';
import { invalidatePlatformUsers } from '../utils/authCache.js';

class AuthService {
  /**
   * Employee login. Every attempt is written to the login history. The error message is the same
   * for every failure so it does not reveal whether an email exists.
   */
  async platformLogin(email, password, ctx = {}) {
    const user = await prisma.platformUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    const fail = async (reason) => {
      await activityService.recordLogin({ userId: user?.id ?? null, email, success: false, reason, ctx });
      throw new UnauthorizedError('Invalid email or password');
    };

    if (!user) return fail('UNKNOWN_EMAIL');
    if (!user.isActive || user.employeeStatus === 'EXITED') return fail('ACCOUNT_DISABLED');
    if (!(await comparePassword(password, user.passwordHash))) return fail('WRONG_PASSWORD');

    await prisma.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await activityService.recordLogin({ userId: user.id, email, success: true, ctx });

    return this._generateTokens(user, 'PLATFORM');
  }

  /**
   * Unified login used by the single web portal. Auto-detects the account
   * type: platform admins live in platformUser, tenant users in tenantUser.
   * We try platform first (smaller table, super-admins), then tenant.
   * A generic error is returned if neither matches so we don't leak which
   * table an email exists in.
   */
  async login(email, password, ctx = {}) {
    const platformUser = await prisma.platformUser.findFirst({
      where: { email: { equals: email, mode: 'insensitive' }, deletedAt: null },
      select: { id: true },
    });
    if (platformUser) {
      return this.platformLogin(email, password, ctx);
    }

    const tenantUser = await prisma.tenantUser.findFirst({
      where: { email, isActive: true, deletedAt: null },
    });
    if (tenantUser) {
      return this.tenantLogin(email, password);
    }

    throw new UnauthorizedError('Invalid email or password');
  }

  async tenantLogin(email, password) {
    const user = await prisma.tenantUser.findFirst({
      where: { email, isActive: true, deletedAt: null },
      include: {
        role: { include: { permissions: { include: { permission: true } } } },
        tenant: { include: { subscription: true } },
      },
    });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid email or password');
    }

    if (user.tenant.status === 'SUSPENDED') {
      throw new UnauthorizedError('Your organization account is suspended. Contact support.');
    }
    if (user.tenant.status === 'DISMISSED') {
      throw new UnauthorizedError('Your organization account has been terminated.');
    }

    await prisma.tenantUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this._generateTokens(user, 'TENANT', user.tenant);
  }

  async refreshToken(token) {
    const stored = await prisma.refreshToken.findFirst({
      where: { token, revokedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!stored) throw new UnauthorizedError('Invalid refresh token');

    let user, scope, tenant;
    if (stored.platformUserId) {
      user = await prisma.platformUser.findFirst({
        where: { id: stored.platformUserId, isActive: true, deletedAt: null, employeeStatus: { not: 'EXITED' } },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      });
      scope = 'PLATFORM';
    } else if (stored.residentId) {
      const resident = await prisma.resident.findFirst({
        where: { id: stored.residentId, status: 'ACTIVE' },
        include: {
          tenant: true,
          bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
        },
      });
      if (!resident) throw new UnauthorizedError('Resident not found');

      await prisma.refreshToken.update({
        where: { id: stored.id },
        data: { revokedAt: new Date() },
      });

      return this._generateResidentTokens(resident);
    } else {
      user = await prisma.tenantUser.findFirst({
        where: { id: stored.tenantUserId, isActive: true },
        include: {
          role: { include: { permissions: { include: { permission: true } } } },
          tenant: { include: { subscription: true } },
        },
      });
      scope = 'TENANT';
      tenant = user?.tenant;
    }

    if (!user) throw new UnauthorizedError('User not found');

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this._generateTokens(user, scope, tenant);
  }

  async logout(token) {
    await prisma.refreshToken.updateMany({
      where: { token, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async changePassword(userId, scope, currentPassword, newPassword) {
    let model;
    if (scope === 'PLATFORM') model = prisma.platformUser;
    else if (scope === 'RESIDENT') model = prisma.resident;
    else model = prisma.tenantUser;
    
    const user = await model.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    if (!user.passwordHash) throw new ValidationError('No password is set for this account yet. Set one first.');
    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      // 422 (not 401) so the client shows it on the field instead of treating it as an ended session.
      throw new ValidationError('Current password is incorrect', [{ field: 'currentPassword', message: 'Current password is incorrect' }]);
    }
    // Same rule for everyone: the new password has to be different.
    if (await comparePassword(newPassword, user.passwordHash)) {
      throw new ValidationError('The new password must be different from the current one');
    }

    const data = { passwordHash: await hashPassword(newPassword) };
    if (scope === 'PLATFORM') {
      // Employees need a stronger password and cannot keep the temporary one.
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
        throw new ValidationError('Password must be at least 8 characters with an uppercase letter, a lowercase letter and a number');
      }
      data.mustChangePassword = false;
      data.passwordChangedAt = new Date();
    }

    await model.update({ where: { id: userId }, data });
    if (scope === 'PLATFORM') await invalidatePlatformUsers(userId);
  }

  // ─── RESIDENT AUTH ───────────────────────────────────────────

  async residentSendOtp(phone) {
    const resident = await prisma.resident.findFirst({
      where: { phone, status: 'ACTIVE', deletedAt: null },
    });

    if (!resident) throw new UnauthorizedError('No active resident found with this phone number');
    // The resident app is an add-on the platform switches on per tenant.
    await featureService.assertEnabled(resident.tenantId, 'RESIDENT_APP');

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    await prisma.resident.update({
      where: { id: resident.id },
      data: { loginOtp: otp, otpExpiresAt },
    });

    // Send notification to tenant app (instead of SMS)
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId: resident.tenantId, isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (tenantUser) {
      await prisma.notification.create({
        data: {
          tenantId: resident.tenantId,
          userId: tenantUser.id,
          userType: 'TENANT',
          title: 'Resident Login OTP',
          message: `${resident.firstName} ${resident.lastName} (${phone}) is trying to login. OTP: ${otp} (expires in 5 min)`,
          channel: 'IN_APP',
          status: 'PENDING',
        },
      });
    }

    console.log(`[RESIDENT OTP] Phone: ${phone}, OTP: ${otp}, Sent to tenant: ${resident.tenantId}`);

    return { phone, message: 'OTP sent to your PG admin. Ask them for the code.' };
  }

  async residentVerifyOtp(phone, otp) {
    const resident = await prisma.resident.findFirst({
      where: { phone, status: 'ACTIVE', deletedAt: null },
      include: {
        tenant: true,
        bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
      },
    });

    if (!resident) throw new UnauthorizedError('No active resident found');
    await featureService.assertEnabled(resident.tenantId, 'RESIDENT_APP');
    if (!resident.loginOtp || resident.loginOtp !== otp) throw new UnauthorizedError('Invalid OTP');
    if (!resident.otpExpiresAt || resident.otpExpiresAt < new Date()) {
      // OTP expired — clear it and delete notification
      await prisma.resident.update({ where: { id: resident.id }, data: { loginOtp: null, otpExpiresAt: null } });
      await prisma.notification.deleteMany({ where: { tenantId: resident.tenantId, title: 'Resident Login OTP', message: { contains: phone } } });
      throw new UnauthorizedError('OTP expired. Please request a new one.');
    }

  // Clear OTP after use
    await prisma.resident.update({
      where: { id: resident.id },
      data: { loginOtp: null, otpExpiresAt: null },
    });

    // Delete the OTP notification from tenant app
    await prisma.notification.deleteMany({
      where: {
        tenantId: resident.tenantId,
        title: 'Resident Login OTP',
        message: { contains: phone },
      },
    });

    return this._generateResidentTokens(resident);
  }

  async residentLoginWithPassword(phone, password) {
    const resident = await prisma.resident.findFirst({
      where: { phone, status: 'ACTIVE', deletedAt: null },
      include: {
        tenant: true,
        bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
      },
    });

    if (!resident) throw new UnauthorizedError('No active resident found with this phone number');
    await featureService.assertEnabled(resident.tenantId, 'RESIDENT_APP');
    if (!resident.passwordHash) throw new UnauthorizedError('Password not set. Please use OTP login.');
    if (!(await comparePassword(password, resident.passwordHash))) throw new UnauthorizedError('Invalid password');

    return this._generateResidentTokens(resident);
  }

  async residentSetPassword(residentId, password) {
    const hashed = await hashPassword(password);
    await prisma.resident.update({
      where: { id: residentId },
      data: { passwordHash: hashed },
    });
  }

  async _generateResidentTokens(resident) {
    const payload = {
      userId: resident.id,
      phone: resident.phone,
      scope: 'RESIDENT',
      tenantId: resident.tenantId,
    };

    const accessToken = generateAccessToken(payload);
    const refreshTokenValue = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshTokenValue,
        residentId: resident.id,
        expiresAt: getTokenExpiry('30d'), // Residents get longer sessions
      },
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      user: {
        id: resident.id,
        phone: resident.phone,
        firstName: resident.firstName,
        lastName: resident.lastName,
        email: resident.email,
        scope: 'RESIDENT',
        tenantId: resident.tenantId,
        tenant: { id: resident.tenant.id, name: resident.tenant.name },
        bed: resident.bed ? {
          label: resident.bed.label,
          room: resident.bed.room?.name,
          floor: resident.bed.room?.floor?.name,
          building: resident.bed.room?.floor?.building?.name,
        } : null,
      },
    };
  }

  async _generateTokens(user, scope, tenant = null) {
    const payload = {
      userId: user.id,
      email: user.email,
      scope,
      roleId: user.roleId,
      ...(scope === 'TENANT' && { tenantId: user.tenantId }),
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        platformUserId: scope === 'PLATFORM' ? user.id : null,
        tenantUserId: scope === 'TENANT' ? user.id : null,
        expiresAt: getTokenExpiry('7d'),
      },
    });

    const permissions = user.role.permissions.map((rp) => rp.permission.code);
    // Feature codes the tenant can use (core + enabled add-ons) so the UI can hide locked menus.
    const enabledFeatures = scope === 'TENANT' && tenant ? await featureService.getEnabledCodes(tenant.id) : undefined;

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        scope,
        role: { id: user.role.id, name: user.role.name, code: user.role.code },
        permissions,
        ...(scope === 'PLATFORM' && {
          employeeCode: user.employeeCode,
          department: user.department,
          designation: user.designation,
          mustChangePassword: user.mustChangePassword,
        }),
        ...(tenant && { tenant: { id: tenant.id, name: tenant.name, status: tenant.status } }),
        ...(enabledFeatures && { enabledFeatures }),
      },
    };
  }
}

export default new AuthService();
