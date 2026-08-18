import prisma from '../config/database.js';
import { NotFoundError } from '../utils/errors.js';

class FoodMenuService {
  async upsert(tenantId, data) {
    const { buildingId, dayOfWeek, mealType, items } = data;

    return prisma.foodMenu.upsert({
      where: {
        tenantId_buildingId_dayOfWeek_mealType: { tenantId, buildingId, dayOfWeek, mealType },
      },
      update: { items, isActive: true },
      create: { tenantId, buildingId, dayOfWeek, mealType, items },
    });
  }

  async bulkUpsert(tenantId, buildingId, menus) {
    const results = [];
    for (const menu of menus) {
      const result = await this.upsert(tenantId, { buildingId, ...menu });
      results.push(result);
    }
    return results;
  }

  // Get full weekly menu for a building
  async getWeeklyMenu(tenantId, buildingId) {
    const menus = await prisma.foodMenu.findMany({
      where: { tenantId, buildingId, isActive: true },
      orderBy: [{ dayOfWeek: 'asc' }, { mealType: 'asc' }],
    });

    // Organize by day
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weeklyMenu = {};
    days.forEach((day, idx) => {
      weeklyMenu[day] = menus.filter((m) => m.dayOfWeek === idx);
    });

    return weeklyMenu;
  }

  // Get today's menu for a building
  async getTodayMenu(tenantId, buildingId) {
    const today = new Date().getDay(); // 0=Sunday, 6=Saturday
    return prisma.foodMenu.findMany({
      where: { tenantId, buildingId, dayOfWeek: today, isActive: true },
      orderBy: { mealType: 'asc' },
    });
  }

  async delete(tenantId, id) {
    const menu = await prisma.foodMenu.findFirst({ where: { id, tenantId } });
    if (!menu) throw new NotFoundError('Menu');
    return prisma.foodMenu.update({ where: { id }, data: { isActive: false } });
  }
}

export default new FoodMenuService();
