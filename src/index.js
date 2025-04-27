import app from './app.js';
import {connectDB} from './config/db.js';
import dotenv from 'dotenv';
import { runSeed } from './scripts/user.js';

dotenv.config();

const PORT = process.env.PORT || 7777;

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
  // runSeed()
});
