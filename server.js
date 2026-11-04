// Server Warkop Posisi: menyajikan website + meneruskan masukan ke bot Telegram.
// Tanpa dependensi tambahan (butuh Node 18+).
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const PAGE = path.join(__dirname, "public", "index.html");

// Pembatas sederhana: maksimal 5 kiriman per 10 menit per alamat IP
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 5;
}

function send(res, code, body, type = "text/plain; charset=utf-8") {
  res.writeHead(code, { "Content-Type": type });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    return send(res, 200, fs.readFileSync(PAGE), "text/html; charset=utf-8");
  }

  if (req.method === "GET" && url === "/health") return send(res, 200, "OK");

  if (req.method === "POST" && url === "/api/feedback") {
    const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();
    if (limited(ip)) return send(res, 429, "Terlalu banyak kiriman");

    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 10000) return send(res, 413, "Terlalu besar");
    }

    let text = "";
    try { text = String(JSON.parse(raw).text || "").trim().slice(0, 1000); }
    catch (e) { return send(res, 400, "Bad request"); }
    if (!text) return send(res, 400, "Kosong");

    if (!BOT_TOKEN || !CHAT_ID) {
      console.error("GAGAL: BOT_TOKEN atau CHAT_ID belum diisi di Variables Railway. BOT_TOKEN ada? " + !!BOT_TOKEN + ", CHAT_ID ada? " + !!CHAT_ID);
      return send(res, 500, "Bot belum dikonfigurasi");
    }

    const waktu = new Date().toLocaleString("id-ID", { timeZone: "Asia/Makassar" });
    const pesan = "📍 Masukan baru - Warkop Posisi\n" + waktu + " WITA\n\n" + text;

    try {
      const r = await fetch("https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: CHAT_ID, text: pesan }),
      });
      if (!r.ok) console.error("GAGAL dari Telegram (" + r.status + "): " + (await r.text()));
      return send(res, r.ok ? 200 : 502, r.ok ? "OK" : "Telegram error");
    } catch (e) {
      console.error("GAGAL menghubungi Telegram: " + e.message);
      return send(res, 502, "Telegram error");
    }
  }

  send(res, 404, "Tidak ditemukan");
});

server.listen(PORT, () => console.log("Warkop Posisi berjalan di port " + PORT));
