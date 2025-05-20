import { faker } from "@faker-js/faker";
import Ad from "../models/Ad.js";
import User from "../models/User.js";
import { ensureDefaultCategories } from "./category.js";
import { ensureDefaultLocations } from "./locations.js";

const NUM_USERS = 10;
const NUM_ADS = 200;

const commonTitle = 'Unbranded Silk Bike'; 

export const runSeed = async () => {
  try {
    const categories = await ensureDefaultCategories();
    const locations = await ensureDefaultLocations();

    const users = [];
    for (let i = 0; i < NUM_USERS; i++) {
      users.push(
        new User({
          name: faker.person.fullName(),
          email: faker.internet.email(),
          password: faker.string.uuid(), // фейковый хеш
          isGuest: false,
          isVerified: true,
        })
      );
    }

    const savedUsers = await User.insertMany(users);

    const ads = [];
    for (let i = 0; i < NUM_ADS; i++) {
      const currencies = ["usd", "idr", "rub"];
      const selected = faker.helpers.arrayElements(
        currencies,
        faker.number.int({ min: 1, max: 3 })
      );
      const price = {};
      if (selected.includes("usd"))
        price.usd = faker.number.int({ min: 100, max: 1000 });
      if (selected.includes("idr"))
        price.idr = faker.number.int({ min: 1500000, max: 10000000 });
      if (selected.includes("rub"))
        price.rub = faker.number.int({ min: 5000, max: 100000 });

      ads.push(
        new Ad({
          title: commonTitle,
          description: faker.commerce.productDescription(),
          price,
          category: faker.helpers.arrayElement(categories)._id,
          location: faker.helpers.arrayElement(locations)._id,
          photos: [
            {
              uri: faker.image.url(),
              filename: faker.system.fileName(),
              // id: new mongoose.Types.ObjectId(), // если поле id обязательно в photos — добавь!
            },
            {
              uri: faker.image.url(),
              filename: faker.system.fileName(),
            }
          ],
          author: faker.helpers.arrayElement(savedUsers)._id,
        })
      );
    }


    await Ad.insertMany(ads);
    console.log(`📦 Добавлено ${ads.length} объявлений`);
  } catch (err) {
    console.error("Ошибка сидирования:", err);
    process.exit(1);
  }
};
