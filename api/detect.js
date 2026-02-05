import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  const { text } = req.body;

  if (!text) {
    return res.status(400).json({ error: "Text required" });
  }

  // 🔐 Gemini API call happens HERE (backend)
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + process.env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }]
      })
    }
  );

  const data = await response.json();

  res.status(200).json({
    scam: /otp|upi|blocked/i.test(text),
    aiResponse: data.candidates?.[0]?.content?.parts?.[0]?.text
  });
}
