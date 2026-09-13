/* server.js — Servidor Express que serve os arquivos estáticos
   e faz proxy das chamadas de API (chave nunca vai ao browser) */

import "node:process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Carrega o .env manualmente (sem dependência extra) ──────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
try {
  const env = readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)\s*=\s*(.*)$/);
    if (m) process.env[m[1]] = m[2].trim();
  }
} catch { /* .env não existe — ok */ }

const PORT = Number(process.env.PORT) || 3000;

// ── Importa Express ─────────────────────────────────────────────────
const { default: express } = await import("express");
const app = express();
app.use(express.json({ limit: "1mb" }));
// ── Endpoint proxy — /api/chat ──────────────────────────────────────
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, max_tokens = 1800 } = req.body;

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "GROQ_API_KEY não configurada no .env" });
    }

    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({ model: "groq/compound", max_tokens, messages })
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data });
    }
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Serve arquivos estáticos (depois das rotas de API) ───────────────
app.use(express.static(__dirname));

app.listen(PORT, () => {
  console.log(`\n✅  Leitor de Indícios rodando em → http://localhost:${PORT}\n`);
});
