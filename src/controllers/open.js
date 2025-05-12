export const openAd = (req, res) => {
  const { id } = req.query;

  if (!id) {
    return res.status(400).send("Missing ID");
  }

  //   в проде поменять
  //   const deepLink = `balivito://${id}`;

  const deepLink = `exp://192.168.31.16:8081/--/${id}`;

  res.redirect(deepLink);
};
