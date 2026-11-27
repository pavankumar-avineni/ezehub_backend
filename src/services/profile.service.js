import prisma from '../config/database.js';
import { uploadToCloudinary } from '../config/cloudinary.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { cacheDel } from '../utils/cache.js';
import { userCacheKey } from '../utils/authCache.js';

// What each kind of user may change about themselves. Anything HR/admin controlled (role, email,
// department, status, ID proof...) is not listed and can only be changed by an administrator.
const EDITABLE = {
  PLATFORM: ['firstName', 'lastName', 'phone', 'personalEmail', 'personalPhone', 'address', 'city', 'state', 'pincode', 'emergencyContact'],
  TENANT: ['firstName', 'lastName', 'phone'],
  RESIDENT: ['email', 'alternatePhone', 'occupation', 'company', 'college', 'bloodGroup', 'foodPreference', 'emergencyContact'],
};

const MODELS = {
  PLATFORM: () => prisma.platformUser,
  TENANT: () => prisma.tenantUser,
  RESIDENT: () => prisma.resident,
};

const AVATAR_FIELD = { PLATFORM: 'avatar', TENANT: 'avatar', RESIDENT: 'profilePhoto' };

const SELECT = {
  PLATFORM: {
    id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, personalEmail: true, personalPhone: true,
    employeeCode: true, department: true, designation: true, joiningDate: true, employmentType: true, address: true, city: true,
    state: true, pincode: true, emergencyContact: true, employeeStatus: true, lastLoginAt: true, createdAt: true,
    passwordChangedAt: true, mustChangePassword: true,
    role: { select: { id: true, name: true, code: true } },
    reportsTo: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
  },
  TENANT: {
    id: true, email: true, firstName: true, lastName: true, phone: true, avatar: true, lastLoginAt: true, createdAt: true,
    role: { select: { id: true, name: true, code: true } },
    tenant: { select: { id: true, name: true } },
  },
  RESIDENT: {
    id: true, firstName: true, lastName: true, email: true, phone: true, alternatePhone: true, profilePhoto: true,
    dateOfBirth: true, gender: true, bloodGroup: true, foodPreference: true, occupation: true, company: true, college: true,
    emergencyContact: true, checkInDate: true, createdAt: true, passwordHash: true,
    tenant: { select: { id: true, name: true } },
  },
};

const scopeOf = (user) => (user.scope === 'PLATFORM' || user.scope === 'RESIDENT' ? user.scope : 'TENANT');
const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

class ProfileService {
  async getMe(user) {
    const scope = scopeOf(user);
    const row = await MODELS[scope]().findFirst({ where: { id: user.id }, select: SELECT[scope] });
    if (!row) throw new NotFoundError('Profile');

    const { passwordHash, reportsTo, ...rest } = row;
    const out = { ...rest, scope, editableFields: EDITABLE[scope] };
    if (scope === 'PLATFORM') {
      out.name = `${row.firstName} ${row.lastName}`.trim();
      out.reportsTo = reportsTo ? { ...reportsTo, name: `${reportsTo.firstName} ${reportsTo.lastName}`.trim() } : null;
    }
    if (scope === 'RESIDENT') out.hasPassword = !!passwordHash;
    return out;
  }

  async updateMe(user, body) {
    const scope = scopeOf(user);
    const data = {};
    for (const field of EDITABLE[scope]) {
      if (body[field] === undefined) continue;
      data[field] = field === 'emergencyContact' ? this._contact(body[field]) : emptyToNull(body[field]);
    }
    // Required names can never be blanked.
    for (const f of ['firstName', 'lastName']) {
      if (f in data && !data[f]) throw new ValidationError(`${f === 'firstName' ? 'First' : 'Last'} name is required`);
    }
    if (!Object.keys(data).length) throw new ValidationError('Nothing to update');

    await MODELS[scope]().update({ where: { id: user.id }, data });
    await this._forget(scope, user.id);
    return { changed: Object.keys(data) };
  }

  async setAvatar(user, file) {
    if (!file) throw new ValidationError('Image file is required');
    if (!file.mimetype?.startsWith('image/')) throw new ValidationError('Only image files are allowed');
    const scope = scopeOf(user);
    const result = await uploadToCloudinary(file.buffer, { folder: `ezehub/avatars/${scope.toLowerCase()}`, resourceType: 'image' });
    await MODELS[scope]().update({ where: { id: user.id }, data: { [AVATAR_FIELD[scope]]: result.secure_url } });
    await this._forget(scope, user.id);
    return { url: result.secure_url };
  }

  async removeAvatar(user) {
    const scope = scopeOf(user);
    await MODELS[scope]().update({ where: { id: user.id }, data: { [AVATAR_FIELD[scope]]: null } });
    await this._forget(scope, user.id);
  }

  _contact(value) {
    if (value === null) return {};
    const v = value || {};
    return { name: (v.name || '').trim(), relation: (v.relation || '').trim(), phone: (v.phone || '').trim() };
  }

  _forget(scope, id) {
    return cacheDel(userCacheKey(scope, id));
  }
}

export default new ProfileService();
