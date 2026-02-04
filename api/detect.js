export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { text } = req.body;

  // mock logic / AI logic
  const isScam = text?.toLowerCase().includes("otp");

  res.status(200).json({
    scam: isScam,
    message: isScam ? "Scam detected" : "Safe message"
  });
}
