// ============================================
// 🍸 La Victoire — WhatsApp Bot via WaSenderAPI
// ============================================

try { require("dotenv").config(); } catch (e) {}

const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

const WASENDER_API_KEY = process.env.WASENDER_API_KEY;
const WASENDER_WEBHOOK_SECRET = process.env.WASENDER_WEBHOOK_SECRET || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const PORT = process.env.PORT || 3000;
const WASENDER_BASE = "https://wasenderapi.com/api";

// ==========================================
// 📚 БАЗА ЗНАНИЙ
// ==========================================
const K = {
  name: "La Victoire",
  address: "Avenue Eudore Pirmez 12, 1040 Etterbeek, Bruxelles",
  phone: "+32 2 647 43 87",
  hours: "Tous les jours / Daily: 08:00 — 23:00",
  rating: "4.5 Google (56+ avis)",
  menu: {
    coffee: "Espresso 2.50, Double Espresso 3.50, Cappuccino 3.80, Latte Macchiato 4.20, Cafe Creme 3.00, The 3.00, Chocolat Chaud 4.00",
    cocktails: "Mojito 9.50, Cosmopolitan 10, Margarita 10, Gin Tonic Premium 9, Spritz Aperol 8.50, Moscow Mule 9.50, Negroni 10, Espresso Martini 10.50",
    beer: "Jupiler 25cl 3 / 50cl 5, Leffe Blonde 4.50, Leffe Brune 4.50, Chimay Bleue 6, Duvel 5.50, Hoegaarden 4",
    snacks: "Planche mixte 14.50, Bruschetta 8.50, Croquettes crevettes x6 12, Olives 5, Bitterballen x8 7.50, Frites maison 5.50, Croque-Monsieur 9",
    soft: "Coca/Fanta/Sprite 3, Jus d Orange frais 4.50, Eau Minerale 2.50, Limonade maison 4, Red Bull 4.50",
  },
  events: [
    "Mardi: Quiz Night 20:00 gratuit",
    "Jeudi: Live Music Acoustic 20:30",
    "Vendredi: DJ Set 21:00 entree libre",
    "Samedi: Cocktail Night cocktails a 7 EUR",
    "Dimanche: Brunch & Chill 10:00-14:00",
  ],
};

const SYSTEM_PROMPT = "Tu es l assistant WhatsApp du cafe-bar La Victoire a Etterbeek, Bruxelles. Reponds dans la langue du client (FR, NL, EN, RU). Sois chaleureux, concis (max 3-4 phrases). Utilise quelques emojis. Pour reserver: collecte nom, date, heure, nombre de personnes, telephone. Ne donne JAMAIS de fausses informations. Adresse: " + K.address + " Tel: " + K.phone + " Horaires: " + K.hours + " Note: " + K.rating + " WiFi gratuit, Paiement cash et cartes. CAFE: " + K.menu.coffee + " COCKTAILS: " + K.menu.cocktails + " BIERES: " + K.menu.beer + " SNACKS: " + K.menu.snacks + " SOFT: " + K.menu.soft + " EVENEMENTS: " + K.events.join(" | ") + " RESERVATIONS: Max 20 pers. Groupes 6+: reservez a l avance. Groupes 10+: min 48h.";

const history = new Map();

// ==========================================
// WEBHOOK
// ==========================================
app.post("/webhook", async (req, res) => {
  res.status(200).json({ received: true });
  try {
    if (WASENDER_WEBHOOK_SECRET) {
      var sig = req.headers["x-webhook-signature"];
      if (sig !== WASENDER_WEBHOOK_SECRET) return;
    }
    var evt = req.body.event;
    var data = req.body.data;
    if (evt !== "messages.received") return;
    var msg = data && data.messages;
    if (!msg) return;
    if (msg.key && msg.key.fromMe) return;
    var from = (msg.key && msg.key.cleanedSenderPn) || (msg.key && msg.key.remoteJid);
    var text = msg.messageBody || "";
    if (!from || !text.trim()) return;
    console.log("MSG from " + from + ": " + text);
    var reply = await generateReply(from, text);
    await sendMessage(from, reply);
    console.log("REPLY to " + from);
  } catch (err) {
    console.error("ERROR:", err.message);
  }
});

// ==========================================
// GENERATE REPLY
// ==========================================
async function generateReply(userId, text) {
  var local = getLocalReply(text);
  if (local) return local;
  return await getAIReply(userId, text);
}

function getLocalReply(text) {
  var t = text.toLowerCase();
  if (t.match(/привет|здрав|bonjour|hello|salut|^hi$|hallo/))
    return "Bonjour! Dobro pozhalovat v La Victoire!\n\nYa virtualnyj pomoshchnik. Chem mogu pomoch?\n\nMenu\nChasy raboty\nBronirovanie\nMeropriyatiya\nAdres";
  if (t.match(/меню|menu|carte|карта/))
    return "Menu La Victoire\n\nCafe:\n" + K.menu.coffee + "\n\nCocktails:\n" + K.menu.cocktails + "\n\nBiere:\n" + K.menu.beer + "\n\nSnacks:\n" + K.menu.snacks + "\n\nSoft:\n" + K.menu.soft;
  if (t.match(/час|работ|heure|horaire|open|hours|когда/))
    return "Heures: " + K.hours;
  if (t.match(/брон|столик|réserv|réserv|book|table|reserv/))
    return "Reservation La Victoire\n\nIndiquez:\n1. Nom\n2. Date et heure\n3. Nombre de personnes\n4. Telephone\n\nOu appelez: " + K.phone;
  if (t.match(/мероприят|событи|event|événement|програм/))
    return "Evenements:\n" + K.events.join("\n");
  if (t.match(/адрес|где|добрать|address|where|où|location/))
    return "La Victoire\n" + K.address + "\nMetro: Thierry (ligne 5)\nTel: " + K.phone;
  if (t.match(/коктейл|cocktail|drink/))
    return "Cocktails:\n" + K.menu.cocktails;
  if (t.match(/пиво|bière|beer|бельг/))
    return "Bieres belges:\n" + K.menu.beer;
  if (t.match(/кофе|café|coffee/))
    return "Cafe:\n" + K.menu.coffee;
  if (t.match(/закус|еда|food|snack|manger/))
    return "Snacks:\n" + K.menu.snacks;
  if (t.match(/wifi|вай-фай|интернет/))
    return "WiFi gratuit! Mot de passe au bar";
  if (t.match(/спасибо|merci|thank/))
    return "De rien! On vous attend a La Victoire!";
  return null;
}

async function getAIReply(userId, text) {
  var conv = history.get(userId) || [];
  conv.push({ role: "user", content: text });
  if (conv.length > 16) conv = conv.slice(-16);
  try {
    var res = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: conv.map(function(m) { return { role: m.role, content: m.content }; }),
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
    var reply = (res.data.content && res.data.content[0] && res.data.content[0].text) || getFallback();
    conv.push({ role: "assistant", content: reply });
    history.set(userId, conv);
    return reply;
  } catch (err) {
    console.error("Claude error:", err.message);
    return getFallback();
  }
}

function getFallback() {
  return "Merci pour votre message!\n\nJe peux vous aider avec:\nMenu\nHoraires\nReservations\nEvenements\nAdresse\n\nOu appelez: " + K.phone;
}

// ==========================================
// SEND MESSAGE
// ==========================================
async function sendMessage(to, text) {
  try {
    await axios.post(
      WASENDER_BASE + "/send-message",
      { to: to, text: text },
      { headers: { Authorization: "Bearer " + WASENDER_API_KEY, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("WaSender error:", (err.response && err.response.data) || err.message);
  }
}

// ==========================================
// HEALTH CHECK
// ==========================================
app.get("/", function(req, res) {
  res.json({ status: "La Victoire Bot is running", platform: "WaSenderAPI", timestamp: new Date().toISOString() });
});

// ==========================================
// START
// ==========================================
app.listen(PORT, function() {
  console.log("La Victoire Bot running on port " + PORT);
});
