import Ad from '../models/Ad.js';
import User from '../models/User.js';
import { ensureDefaultCategories } from './category.js';
import { ensureDefaultLocations } from './locations.js';
import { faker } from '@faker-js/faker';

const NUM_USERS = 10;
const NUM_ADS = 50;

export const runSeed = async () => {
  try {
    const categories = await ensureDefaultCategories();
    const locations = await ensureDefaultLocations();

    const users = [];
    for (let i = 0; i < NUM_USERS; i++) {
      users.push(new User({
        name: faker.person.fullName(),
        email: faker.internet.email(),
        password: faker.string.uuid(), // фейковый хеш
        isGuest: false,
        isVerified: true,
      }));
    }

    const savedUsers = await User.insertMany(users);
    console.log(`👤 Добавлено ${savedUsers.length} пользователей`);

    const ads = [];
    for (let i = 0; i < NUM_ADS; i++) {
      ads.push(new Ad({
        title: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        price: faker.number.int({ min: 100, max: 10000 }),
        category: faker.helpers.arrayElement(categories)._id,
        location: faker.helpers.arrayElement(locations)._id,
        photos: [faker.image.url(), faker.image.url()],
        author: faker.helpers.arrayElement(savedUsers)._id,
      }));
    }

    await Ad.insertMany(ads);
    console.log(`📦 Добавлено ${ads.length} объявлений`);

  } catch (err) {
    console.error('Ошибка сидирования:', err);
    process.exit(1);
  }
};
