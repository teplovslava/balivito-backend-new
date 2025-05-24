// middleware/setLocale.js
export const setLocale = (req, res, next) => {
  req.language = req.headers['accept-language']?.split(',')[0] || 'en';
  console.log(req.language)
  next();
};