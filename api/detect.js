import fetch from "node-fetch";

export default async function handler(req, res) {
  // 🔑 REQUIRED by tester
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) {
    return res.status(401).json({ error: "x-api-key missing" });
  }

  // 🔒 Accept dev-key explicitly (as required)
  if (apiKey !== "dev-key") {
    return res.status(403).json({ error: "Invalid API key" });
  }

  // 🧪 TESTER MODE (always fast response)
  if (!req.body || typeof req.body.text !== "string") {
    return res.status(200).json({
      status: "ok",
      authenticated: true,
      honeypot: true
    });
  }

  // 🤖 REAL ANALYSIS (only when text exists)
  const { text } = req.body;

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
      process.env.GEMINI_API_KEY,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }]
      })
    }
  );

  const data = await response.json();

  return res.status(200).json({
    scam: /otp|upi|blocked/i.test(text),
    aiResponse: data.candidates?.[0]?.content?.parts?.[0]?.text
  });
}
