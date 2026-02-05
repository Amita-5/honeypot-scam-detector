export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok" });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers["x-api-key"];
  if (apiKey !== "dev-key") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `
You are an AI honeypot chat bot.

Decide if the message is a scam.
If scam, reply like a real person and keep the scammer talking.
Never share OTP, PIN, or personal info.
If not scam, reply politely.

Return ONLY valid JSON:
{
  "isScam": true or false,
  "reply": "message to send back",
  "scamType": "OTP / Bank / UPI / None"
}

Message:
"${text}"
`
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();
    const aiText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let result;
    try {
      result = JSON.parse(aiText);
    } catch {
      result = {
        isScam: false,
        reply: "Okay, thanks for the message!",
        scamType: "None"
      };
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: "Gemini failed" });
  }
}
