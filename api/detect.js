import fetch from "node-fetch";

/**
 * In-memory session store (hackathon-safe)
 */
const sessionState = {};

async function generateGeminiReply(prompt) {
  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      }
    );

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey) return res.status(401).json({ error: "x-api-key missing" });
  if (apiKey !== "dev-key") return res.status(403).json({ error: "Invalid API key" });

  const { sessionId, message, conversationHistory = [], metadata = {} } = req.body;
  const text = message?.text;

  if (!sessionId || !text) {
    return res.status(200).json({
      status: "success",
      reply: "Can you explain this message?"
    });
  }

  // ---------- INIT SESSION ----------
  if (!sessionState[sessionId]) {
    sessionState[sessionId] = {
      turns: 0,
      scamIndicators: new Set(),
      requestedData: new Set(),
      finalized: false
    };
  }

  const state = sessionState[sessionId];
  state.turns += 1;

  // ---------- SCAM INTELLIGENCE EXTRACTION ----------
  const lower = text.toLowerCase();

  if (/otp|one time password/.test(lower)) state.requestedData.add("OTP");
  if (/upi|account number|bank/.test(lower)) state.requestedData.add("Bank Details");
  if (/link|click/.test(lower)) state.scamIndicators.add("Phishing Link");
  if (/blocked|suspended|urgent|hours/.test(lower)) state.scamIndicators.add("Threat / Urgency");
  if (/won|prize|reward/.test(lower)) state.scamIndicators.add("Lottery Scam");

  // ---------- BASE HUMAN REPLY (SAFE FALLBACK) ----------
  let baseReply;
  if (state.turns === 1) baseReply = "Why is my account being suspended?";
  else if (state.turns === 2) baseReply = "What exactly do you need to verify?";
  else if (state.turns === 3) baseReply = "I haven’t received any official notification.";
  else baseReply = "Can you share official confirmation for this request?";

  // ---------- GEMINI REPHRASING (OPTIONAL) ----------
  const geminiPrompt = `
You are a cautious bank customer.
Ask ONE short clarification question.
Do NOT share personal information.
Do NOT mention scams or security.
Rephrase naturally:

"${baseReply}"
`;

  const geminiReply = await generateGeminiReply(geminiPrompt);
  const reply = geminiReply || baseReply;

  // ---------- FINALIZATION + GUVI CALLBACK ----------
  if (state.turns >= 4 && !state.finalized) {
    state.finalized = true;

    const intelligencePayload = {
      sessionId,
      scamDetected: true,
      scamIndicators: Array.from(state.scamIndicators),
      requestedSensitiveData: Array.from(state.requestedData),
      channel: metadata.channel || "Unknown",
      language: metadata.language || "Unknown",
      locale: metadata.locale || "Unknown",
      totalTurns: state.turns
    };

    try {
      await fetch("https://hackathon.guvi.in/api/updateHoneyPotFinalResult", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intelligencePayload)
      });
    } catch {
      // Silent by design
    }
  }

  // ---------- FINAL RESPONSE ----------
  return res.status(200).json({
    status: "success",
    reply
  });
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
