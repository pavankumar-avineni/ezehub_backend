import prisma from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, getTokenExpiry } from '../utils/jwt.js';
import { UnauthorizedError, NotFoundError } from '../utils/errors.js';

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
      throw new UnauthorizedError('Your organization account is suspended');
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
    const model = scope === 'PLATFORM' ? prisma.platformUser : prisma.tenantUser;
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
