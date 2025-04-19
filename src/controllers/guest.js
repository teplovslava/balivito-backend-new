import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';

export const assignGuestId = async (req, res) => {
  try {
    const newGuest = new User({
      isGuest: true,
      name: `Guest_${uuidv4().slice(0, 6)}`,
      email: `guest_${uuidv4()}@example.com`,
      password: uuidv4()
    });
    
    await newGuest.save();

    res.cookie('guestId', newGuest._id.toString(), {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 дней
      sameSite: 'Lax',
    });
    res.json({ guestId: newGuest._id });
  } catch (err) {
    console.error('Ошибка создания гостя:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};