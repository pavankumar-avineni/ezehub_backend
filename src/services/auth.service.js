import prisma from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, getTokenExpiry } from '../utils/jwt.js';
import { UnauthorizedError, NotFoundError } from '../utils/errors.js';
import { firebaseAuth } from '../config/firebase.js';

class AuthService {
  async platformLogin(email, password) {
    const user = await prisma.platformUser.findFirst({
      where: { email, isActive: true, deletedAt: null },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!user || !(await comparePassword(password, user.passwordHash))) {
      throw new UnauthorizedError('Invalid email or password');
    }

    await prisma.platformUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this._generateTokens(user, 'PLATFORM');
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
        where: { id: stored.platformUserId, isActive: true },
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

    if (!(await comparePassword(currentPassword, user.passwordHash))) {
      throw new UnauthorizedError('Current password is incorrect');
    }

    await model.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword) },
    });
  }

  // ─── RESIDENT AUTH ───────────────────────────────────────────

  async residentSendOtp(phone) {
    const resident = await prisma.resident.findFirst({
      where: { phone, status: 'ACTIVE', deletedAt: null },
    });

    if (!resident) throw new UnauthorizedError('No active resident found with this phone number');

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    await prisma.resident.update({
      where: { id: resident.id },
      data: { loginOtp: otp, otpExpiresAt },
    });

    // In production, send OTP via SMS. For now, log it.
    console.log(`[RESIDENT OTP] Phone: ${phone}, OTP: ${otp}`);

    return { phone, message: 'OTP sent successfully', otpForDev: otp };
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
    if (!resident.loginOtp || resident.loginOtp !== otp) throw new UnauthorizedError('Invalid OTP');
    if (!resident.otpExpiresAt || resident.otpExpiresAt < new Date()) throw new UnauthorizedError('OTP expired');

    // Clear OTP after use
    await prisma.resident.update({
      where: { id: resident.id },
      data: { loginOtp: null, otpExpiresAt: null },
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

  // ─── FIREBASE PHONE AUTH ─────────────────────────────────────

  async residentFirebaseLogin(firebaseToken) {
    // Verify the Firebase ID token
    let decodedToken;
    try {
      decodedToken = await firebaseAuth.verifyIdToken(firebaseToken);
    } catch (err) {
      console.error('Firebase token verification failed:', err.message);
      throw new UnauthorizedError('Invalid or expired Firebase token');
    }

    // Extract phone number from Firebase token
    const phoneNumber = decodedToken.phone_number;
    if (!phoneNumber) {
      throw new UnauthorizedError('No phone number found in Firebase token');
    }

    // Normalize phone — remove country code prefix (+91)
    const phone = phoneNumber.replace(/^\+91/, '').replace(/^\+/, '');

    // Find resident by phone
    const resident = await prisma.resident.findFirst({
      where: { phone, status: 'ACTIVE', deletedAt: null },
      include: {
        tenant: true,
        bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
      },
    });

    if (!resident) {
      throw new UnauthorizedError('No active resident found with this phone number');
    }

    return this._generateResidentTokens(resident);
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

    const permissions = user.role.permissions.map((rp) => rp.permission.slug);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        scope,
        role: { id: user.role.id, name: user.role.name, slug: user.role.slug },
        permissions,
        ...(tenant && { tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status } }),
      },
    };
  }
}

export default new AuthService();
