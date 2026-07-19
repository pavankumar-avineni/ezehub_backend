export const successResponse = (res, data = null, message = 'Success', statusCode = 200, meta = null) => {
  const response = { success: true, message };
  if (data !== null) response.data = data;
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
};

export const paginatedResponse = (res, data, pagination, message = 'Success') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    meta: {
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: Math.ceil(pagination.total / pagination.limit),
        hasNext: pagination.page * pagination.limit < pagination.total,
        hasPrev: pagination.page > 1,
      },
    },
  });
};

export const errorResponse = (res, message = 'Internal Server Error', statusCode = 500, errors = null) => {
  const response = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

export const parsePagination = (query) => {
  const page = Math.max(1, parseInt(query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit) || 20));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const parseSort = (query, allowedFields = ['createdAt'], defaultField = 'createdAt') => {
  const sortBy = allowedFields.includes(query.sortBy) ? query.sortBy : defaultField;
  const sortOrder = query.sortOrder === 'asc' ? 'asc' : 'desc';
  return { [sortBy]: sortOrder };
};

export const parseSearch = (query, fields = []) => {
  if (!query.search || fields.length === 0) return {};
  return {
    OR: fields.map((field) => ({
      [field]: { contains: query.search, mode: 'insensitive' },
    })),
  };
};

export const generateCode = (prefix, count) => {
  return `${prefix}-${String(count + 1).padStart(4, '0')}`;
};

export const generateReceiptNumber = () => {
  const date = new Date();
  const prefix = `RCP${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
};

export const generateInvoiceNumber = (tenantSlug) => {
  const date = new Date();
  const prefix = `INV-${tenantSlug.toUpperCase().substring(0, 3)}-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${random}`;
};

export const generateOTP = (length = 6) => {
  return Math.floor(Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)).toString();
};

export const omit = (obj, keys) => {
  const result = { ...obj };
  keys.forEach((key) => delete result[key]);
  return result;
};

export const pick = (obj, keys) => {
  return keys.reduce((acc, key) => {
    if (obj[key] !== undefined) acc[key] = obj[key];
    return acc;
  }, {});
};
