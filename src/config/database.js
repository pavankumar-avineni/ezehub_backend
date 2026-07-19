import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'error' }]
    : [{ emit: 'stdout', level: 'error' }],
});

if (process.env.NODE_ENV === 'development') {
  prisma.$on('query', (e) => {
    logger.debug({ query: e.query, duration: `${e.duration}ms` });
  });
}

export default prisma;
