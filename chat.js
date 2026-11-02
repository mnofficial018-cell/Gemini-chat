// ===== আপনার নির্দেশনা এখানে বদলান =====
// এই লেখাটা Gemini সবসময় মেনে চলবে। সবাইকে কিছু বলাতে চাইলে এখানে লিখুন।
const SYSTEM_INSTRUCTION = `
তুমি একজন সহায়ক ও বন্ধুসুলভ AI সহকারী। যে কোনো বিষয়ে প্রশ্নের উত্তর দিতে পারো।
ব্যবহারকারী যে ভাষায় লেখেন, সেই ভাষাতেই উত্তর দাও।
উত্তর স্পষ্ট ও সংক্ষিপ্ত রাখো, দরকার হলে বিস্তারিত বলো।
`;
// ======================================

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const MAX_MESSAGES = 30;   // কতগুলো আগের মেসেজ মনে রাখবে
const MAX_CHARS = 4000;    // প্রতিটি মেসেজের সর্বোচ্চ অক্ষর

const reply = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, { error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return reply(500, { error: "GEMINI_API_KEY সেট করা হয়নি।" });

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return reply(400, { error: "ভুল অনুরোধ।" });
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-MAX_MESSAGES) : [];
  const contents = messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim() &&
                   (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, MAX_CHARS) }],
    }));

  if (!contents.length || contents[contents.length - 1].role !== "user") {
    return reply(400, { error: "কোনো মেসেজ পাওয়া যায়নি।" });
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          contents,
          generationConfig: { maxOutputTokens: 4096 },
        }),
      }
    );

    const data = await res.json();
    if (!res.ok) {
      console.error("Gemini error:", JSON.stringify(data));
      const msg = res.status === 429
        ? "এখন অনেক অনুরোধ এসেছে, একটু পরে আবার চেষ্টা করুন।"
        : "AI থেকে উত্তর আনতে সমস্যা হয়েছে।";
      return reply(502, { error: msg });
    }

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      return reply(200, { reply: "দুঃখিত, এই অনুরোধের উত্তর আমি দিতে পারছি না।" });
    }

    const parts = (data.candidates && data.candidates[0] && data.candidates[0].content &&
                   data.candidates[0].content.parts) || [];
    const text = parts.filter((p) => p.text && !p.thought).map((p) => p.text).join("").trim();

    return reply(200, { reply: text || "দুঃখিত, কোনো উত্তর পাওয়া যায়নি।" });
  } catch (err) {
    console.error(err);
    return reply(500, { error: "সার্ভারে সমস্যা হয়েছে।" });
  }
};
