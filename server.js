// ============================================
// 🍸 La Victoire — WhatsApp Bot via WaSenderAPI
// ============================================
// Стек: Express + WaSenderAPI + Claude AI
// ============================================

require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================================
// 📋 КОНФИГУРАЦИЯ
// ==========================================
const {
  WASENDER_API_KEY,      // Ваш WaSenderAPI Access Token
  WASENDER_WEBHOOK_SECRET, // Секрет для проверки webhook (опционально)
  ANTHROPIC_API_KEY,     // API ключ Claude
  PORT = 3000,
} = process.env;

const WASENDER_BASE = "https://wasenderapi.com/api";

// ==========================================
// 📚 БАЗА ЗНАНИЙ La Victoire
// ==========================================
const K = {
  name: "La Victoire",
  address: "Avenue Eudore Pirmez 12, 1040 Etterbeek, Bruxelles",
  phone: "+32 2 647 43 87",
  hours: "Tous les jours / Daily: 08:00 — 23:00",
  rating: "4.5 ★ Google (56+ avis)",

  menu: {
    coffee: "Espresso 2.50€, Double Espresso 3.50€, Cappuccino 3.80€, Latte Macchiato 4.20€, Café Crème 3.00€, Thé 3.00€, Chocolat Chaud 4.00€",
    cocktails: "Mojito 9.50€, Cosmopolitan 10€, Margarita 10€, Gin Tonic Premium 9€, Spritz Aperol 8.50€, Moscow Mule 9.50€, Negroni 10€, Espresso Martini 10.50€",
    beer: "Jupiler 25cl 3€ / 50cl 5€, Leffe Blonde 4.50€, Leffe Brune 4.50€, Chimay Bleue 6€, Duvel 5.50€, Hoegaarden 4€",
    snacks: "Planche mixte 14.50€, Bruschetta 8.50€, Croquettes crevettes x6 12€, Olives 5€, Bitterballen x8 7.50€, Frites maison 5.50€, Croque-Monsieur 9€",
    soft: "Coca/Fanta/Sprite 3€, Jus d'Orange frais 4.50€, Eau Minérale 2.50€, Limonade maison 4€, Red Bull 4.50€",
  },

  events: [
    "Mardi: Quiz Night — 20:00, gratuit",
    "Jeudi: Live Music Acoustic — 20:30",
    "Vendredi: DJ Set — 21:00, entrée libre",
    "Samedi: Cocktail Night — cocktails à 7€",
    "Dimanche: Brunch & Chill — 10:00-14:00",
  ],
};

// Системный промпт для Claude
const SYSTEM_PROMPT = `Tu es l'assistant WhatsApp du café-bar "La Victoire" à Etterbeek, Bruxelles.

RÈGLES:
- Réponds dans la langue du client (FR, NL, EN, RU, etc.)
- Sois chaleureux, concis (max 3-4 phrases)
- Utilise quelques emojis
- Pour réserver: collecte nom, date, heure, nombre de personnes, téléphone
- Ne donne JAMAIS de fausses informations

INFOS:
Adresse: ${K.address}
Tél: ${K.phone}
Horaires: ${K.hours}
Note: ${K.rating}
WiFi gratuit, Paiement cash & cartes

CAFÉ: ${K.menu.coffee}
COCKTAILS: ${K.menu.cocktails}
BIÈRES: ${K.menu.beer}
SNACKS: ${K.menu.snacks}
SOFT: ${K.menu.soft}

ÉVÉNEMENTS: ${K.events.join(" | ")}

RÉSERVATIONS: Max 20 pers. Groupes 6+: réservez à l'avance. Groupes 10+: min 48h.`;

// История разговоров (in-memory)
const history = new Map();

// ==========================================
// 🔗 WEBHOOK — Приём сообщений от WaSenderAPI
// ==========================================
app.post("/webhook", async (req, res) => {
  // Сразу отвечаем 200
  res.status(200).json({ received: true });

  try {
    // Проверка подписи (если настроен секрет)
    if (WASENDER_WEBHOOK_SECRET) {
      const signature = req.headers["x-webhook-signature"];
      if (signature !== WASENDER_WEBHOOK_SECRET) {
        console.warn("⚠️ Invalid webhook signature");
        return;
      }
    }

    const { event, data } = req.body;

    // Обрабатываем только входящие сообщения
    if (event !== "messages.received") return;

    const msg = data?.messages;
    if (!msg) return;

    // Пропускаем свои сообщения
    if (msg.key?.fromMe) return;

    // Получаем номер отправителя и текст
    const from = msg.key?.cleanedSenderPn || msg.key?.remoteJid;
    const text = msg.messageBody || "";

    if (!from || !text.trim()) return;

    console.log(`📨 От ${from}: "${text}"`);

    // Генерируем ответ
    const reply = await generateReply(from, text);

    // Отправляем ответ
    await sendMessage(from, reply);

    console.log(`✅ Ответ отправлен → ${from}`);
  } catch (err) {
    console.error("❌ Ошибка:", err.message);
  }
});

// ==========================================
// 🤖 Генерация ответа (локальный + AI)
// ==========================================
async function generateReply(userId, text) {
  // Сначала пробуем локальный ответ (быстро и бесплатно)
  const local = getLocalReply(text);
  if (local) return local;

  // Если не нашли — спрашиваем Claude AI
  return await getAIReply(userId, text);
}

// ==========================================
// 📝 Локальные ответы (без AI)
// ==========================================
function getLocalReply(text) {
  const t = text.toLowerCase();

  if (t.match(/привет|здрав|bonjour|hello|salut|^hi$|hallo/))
    return `Bonjour! 👋 Добро пожаловать в *La Victoire*!\n\nЯ виртуальный помощник. Чем могу помочь?\n\n📋 Меню\n🕐 Часы работы\n📅 Бронирование\n🎉 Мероприятия\n📍 Адрес`;

  if (t.match(/меню|menu|carte|карта/))
    return `📋 *Меню La Victoire*\n\n☕ *Кофе:*\n${K.menu.coffee}\n\n🍸 *Коктейли:*\n${K.menu.cocktails}\n\n🍺 *Пиво:*\n${K.menu.beer}\n\n🧀 *Закуски:*\n${K.menu.snacks}\n\n🥤 *Soft:*\n${K.menu.soft}`;

  if (t.match(/час|работ|heure|horaire|open|hours|когда/))
    return `🕐 *Часы работы:*\n${K.hours}\n\nЖдём вас! 😊`;

  if (t.match(/брон|столик|réserv|book|table|reserv/))
    return `📅 *Бронирование в La Victoire*\n\nУкажите:\n1️⃣ Имя\n2️⃣ Дата и время\n3️⃣ Кол-во гостей\n4️⃣ Телефон\n\nИли звоните: ${K.phone} 📞`;

  if (t.match(/мероприят|событи|event|événement|програм|soirée/))
    return `🎉 *Мероприятия:*\n\n${K.events.map((e) => `• ${e}`).join("\n")}\n\nВход свободный! 🎶`;

  if (t.match(/адрес|где|добрать|address|where|où|location|comment venir/))
    return `📍 *La Victoire*\n${K.address}\n\n🚇 Métro: Thierry (ligne 5)\n📞 ${K.phone}`;

  if (t.match(/коктейл|cocktail|drink/))
    return `🍸 *Коктейли:*\n${K.menu.cocktails}\n\n🎉 Суббота — Cocktail Night: всё по 7€!`;

  if (t.match(/пиво|bière|beer|бельг/))
    return `🍺 *Бельгийское пиво:*\n${K.menu.beer}`;

  if (t.match(/кофе|café|coffee/))
    return `☕ *Кофе:*\n${K.menu.coffee}`;

  if (t.match(/закус|еда|food|snack|manger|есть/))
    return `🧀 *Закуски:*\n${K.menu.snacks}`;

  if (t.match(/wifi|вай-фай|интернет/))
    return `📶 Бесплатный WiFi! Пароль у бармена 😊`;

  if (t.match(/спасибо|merci|thank|дякую/))
    return `Пожалуйста! 😊 Ждём вас в La Victoire! 🍸`;

  return null; // не нашли → пойдёт в AI
}

// ==========================================
// 🤖 AI ответ через Claude
// ==========================================
async function getAIReply(userId, text) {
  // Получаем историю
  let conv = history.get(userId) || [];
  conv.push({ role: "user", content: text });
  if (conv.length > 16) conv = conv.slice(-16);

  try {
    const res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: conv.map((m) => ({ role: m.role, content: m.content })),
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        timeout: 25000,
      }
    );

    const reply = res.data.content?.[0]?.text || getFallback();
    conv.push({ role: "assistant", content: reply });
    history.set(userId, conv);
    return reply;
  } catch (err) {
    console.error("❌ Claude API error:", err.message);
    return getFallback();
  }
}

function getFallback() {
  return `Merci pour votre message! 😊\n\nJe peux vous aider avec:\n📋 Menu\n🕐 Horaires\n📅 Réservations\n🎉 Événements\n📍 Adresse\n\nOu appelez: ${K.phone}`;
}

// ==========================================
// 📤 Отправка сообщения через WaSenderAPI
// ==========================================
async function sendMessage(to, text) {
  try {
    await axios.post(
      `${WASENDER_BASE}/send-message`,
      { to, text },
      {
        headers: {
          Authorization: `Bearer ${WASENDER_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    console.error("❌ WaSender send error:", err.response?.data || err.message);
  }
}

// ==========================================
// 🏥 Health check
// ==========================================
app.get("/", (req, res) => {
  res.json({
    status: "🟢 La Victoire Bot is running",
    platform: "WaSenderAPI",
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// 🚀 Запуск
// ==========================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`
=============================
La Victoire WhatsApp Bot
Platform: WaSenderAPI
Port: ${PORT}
Webhook: https://motivated-emotion-production-badf.up.railway.app/webhook
=============================
`);
});
