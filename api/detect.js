export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ----------------------------------
    // 1. Validate x-api-key (AUTH ONLY)
    // ----------------------------------
    const clientKey = req.headers["x-api-key"];

    // You can change "dev-key" to anything you want
    if (!clientKey || clientKey !== "dev-key") {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized: invalid x-api-key"
      });
    }

    // ----------------------------------
    // 2. Gemini key (SERVER ONLY)
    // ----------------------------------
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return res.status(500).json({
        status: "error",
        message: "Gemini API key not configured on server"
      });
    }

    const {
      sessionId,
      message,
      conversationHistory = [],
      metadata = {}
    } = req.body || {};

    if (!message || !message.text) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    // -------------------------------
    // Conversation context builder
    // -------------------------------
    const historyText = conversationHistory
      .map(m => `${m.sender.toUpperCase()}: ${m.text}`)
      .join("\n");

    const prompt = `
You are a normal bank customer.
You are chatting with someone who contacted you first.

Rules:
- Ask ONLY one short clarification question.
- Be polite and human.
- Do NOT share any personal, bank, OTP, or UPI details.
- Do NOT mention scams, fraud, security systems, or AI.
- Do NOT explain policies.
- Adapt naturally based on the conversation.
- If something feels unclear, ask for proof or explanation.

Conversation so far:
${historyText || "None"}

Latest message from other person:
"${message.text}"

Reply as the customer:
`;

    // -------------------------------
    // 3. Gemini API call
    // -------------------------------
    const geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
        geminiKey,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    const geminiData = await geminiResponse.json();

    const geminiReply =
      geminiData?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        ?.join(" ")
        ?.trim() || null;

    // -------------------------------
    // 4. Safe fallback
    // -------------------------------
    const fallbackReplies = [
      "Why is this action required?",
      "Can you explain this in more detail?",
      "I haven’t received any official message about this.",
      "What is the reason for this request?"
    ];

    const reply =
      geminiReply ||
      fallbackReplies[Math.floor(Math.random() * fallbackReplies.length)];

    return res.status(200).json({
      status: "success",
      reply
    });

  } catch (error) {
    console.error("Detect API error:", error);
    return res.status(500).json({
      status: "error",
      reply: "Can you please explain what this is regarding?"
    });
  }
}






// import fetch from "node-fetch";

// export default async function handler(req, res) {
//   // 🔑 REQUIRED by tester
//   const apiKey = req.headers["x-api-key"];

//   if (!apiKey) {
//     return res.status(401).json({ error: "x-api-key missing" });
//   }

//   // 🔒 Accept dev-key explicitly (as required)
//   if (apiKey !== "dev-key") {
//     return res.status(403).json({ error: "Invalid API key" });
//   }

//   // 🧪 TESTER MODE (always fast response)
//   if (!req.body || typeof req.body.text !== "string") {
//     return res.status(200).json({
//       status: "ok",
//       authenticated: true,
//       honeypot: true
//     });
//   }

//   // 🤖 REAL ANALYSIS (only when text exists)
//   const { text } = req.body;

//   const response = await fetch(
//     "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
//       process.env.GEMINI_API_KEY,
//     {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         contents: [{ parts: [{ text }] }]
//       })
//     }
//   );

//   const data = await response.json();

//   return res.status(200).json({
//     scam: /otp|upi|blocked/i.test(text),
//     aiResponse: data.candidates?.[0]?.content?.parts?.[0]?.text
//   });
// }
