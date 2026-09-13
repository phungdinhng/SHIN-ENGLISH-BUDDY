// ============================================================================
//  Ollie – hàm máy chủ (Vercel Serverless Function)
//  Nhận lịch sử trò chuyện từ trang web, gọi Vercel AI Gateway để lấy câu trả
//  lời của Ollie, rồi trả về cho trang web. Khoá API được cất an toàn ở đây
//  (biến môi trường AI_GATEWAY_API_KEY), KHÔNG bao giờ lộ ra trình duyệt.
// ============================================================================

// --- "Nội quy" của Ollie. Muốn đổi tính cách/độ khó, sửa ngay dưới đây rồi lưu lại. ---
var RULES = [
  "You are Ollie, a cheerful, patient English-speaking owl. You help a 11-12 year old student in Vietnam (grade 6) practice SPOKEN English through short, friendly conversation.",
  "Follow these rules on every reply:",
  "1. Use only simple English at CEFR A1-A2 level. Short sentences. Common everyday words a grade-6 learner knows.",
  "2. Keep the 'reply' to 1-2 short sentences, and ALWAYS end it with ONE simple, friendly question so the chat keeps going.",
  "3. Be warm and encouraging. Build on what the child said. Never lecture, never send long paragraphs.",
  "4. If the child makes a clear English mistake, put ONE short, kind correction in 'feedback' (example: \"Nice! We say: I am 12 years old.\"). If there is no real mistake, leave 'feedback' as an empty string.",
  "5. Keep everything safe and age-appropriate (school, family, friends, hobbies, food, animals, daily life, places). If the child goes off-topic or says something unsafe, gently guide back to a friendly topic.",
  "6. 'reply_vi' = a natural Vietnamese translation of your reply. 'feedback_vi' = Vietnamese version of the feedback (empty string if feedback is empty).",
  "7. No emojis inside any field.",
  "Reply with ONLY a JSON object, no extra text, in exactly this shape:",
  '{"reply":"...","reply_vi":"...","feedback":"","feedback_vi":""}'
].join("\n");

module.exports = async function (req, res) {
  // Chỉ nhận phương thức POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  // Tự động dùng khoá đang có: ưu tiên OpenAI, nếu không thì dùng Vercel AI Gateway.
  var endpoint, key, model;
  if (process.env.OPENAI_API_KEY) {
    endpoint = "https://api.openai.com/v1/chat/completions";
    key = process.env.OPENAI_API_KEY;
    model = "gpt-4o-mini";           // rẻ, đủ tốt. Có thể đổi: "gpt-5-mini", "gpt-5-nano"...
  } else if (process.env.AI_GATEWAY_API_KEY) {
    endpoint = "https://ai-gateway.vercel.sh/v1/chat/completions";
    key = process.env.AI_GATEWAY_API_KEY;
    model = "openai/gpt-4o-mini";    // qua Vercel AI Gateway thì tên model có tiền tố "openai/"
  } else {
    res.status(500).json({ error: "Chưa cấu hình khoá API. Thêm OPENAI_API_KEY (hoặc AI_GATEWAY_API_KEY) trong phần Settings của Vercel." });
    return;
  }

  try {
    // Đọc dữ liệu gửi lên
    var body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    body = body || {};

    // Lọc lịch sử hợp lệ, giữ tối đa 16 lượt gần nhất
    var history = Array.isArray(body.history) ? body.history : [];
    history = history.filter(function (m) {
      return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
    }).slice(-16);

    var messages = [{ role: "system", content: RULES }].concat(history);

    // Gọi AI (chuẩn OpenAI Chat Completions)
    var r = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 400,
        response_format: { type: "json_object" }
      })
    });

    if (!r.ok) {
      var detail = await r.text();
      res.status(502).json({ error: "AI trả lỗi (" + r.status + ")", detail: detail.slice(0, 500) });
      return;
    }

    var out = await r.json();
    var content = (out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) || "{}";

    var parsed;
    try { parsed = JSON.parse(content); }
    catch (e) { parsed = { reply: String(content), reply_vi: "", feedback: "", feedback_vi: "" }; }

    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Lỗi máy chủ", detail: String(e && e.message ? e.message : e).slice(0, 300) });
  }
};
