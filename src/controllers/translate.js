import axios from "axios";

export const translate = async (req, res) => {
  const { text, targetLang } = req.body;

  if (!text || !targetLang) {
    return res.status(400).json({ error: "Missing text or targetLang" });
  }

  try {
    const response = await axios.post(
      "http://0.0.0.0:5000:5000/translate",
      {
        q: text,
        source: "auto",
        target: targetLang,
        format: "text",
      },
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const translated = response.data.translatedText;

    if (!translated) {
      return res.status(500).json({ error: "Translation failed" });
    }

    res.json(translated);
  } catch (error) {
    console.error("Translation error:", error.message);
    res.status(500).json({ error: "Translation service unavailable" });
  }
};
