// Netlify Edge Function — CP9 Digital Vault
// Tourne côté Deno (Netlify Edge), DATABASE_URL reste secret côté serveur.
import { neon } from "https://cdn.jsdelivr.net/npm/@neondatabase/serverless@0.10.4/dist/index.mjs";

const CORS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export default async (request) => {
  // Pre-flight CORS
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  const dbUrl = Deno.env.get("DATABASE_URL");
  if (!dbUrl) return json({ error: "DATABASE_URL manquant côté serveur" }, 500);

  const sql = neon(dbUrl);
  const url = new URL(request.url);

  try {
    // ── GET /api?email=xxx → vérifier si l'utilisateur existe déjà ──────────
    if (request.method === "GET") {
      const email = url.searchParams.get("email");
      if (!email) return json({ error: "email requis" }, 400);

      const rows = await sql`
        SELECT prenom, email, instagram, collection
        FROM users
        WHERE email = ${email}
        LIMIT 1
      `;

      if (rows.length === 0) return json({ found: false });
      return json({ found: true, user: rows[0] });
    }

    // ── POST /api → inscrire ou mettre à jour l'utilisateur ─────────────────
    if (request.method === "POST") {
      const body = await request.json();
      const { prenom, email, instagram, collection } = body;

      if (!prenom || !email || !instagram) return json({ error: "Champs manquants" }, 400);

      const cards = Array.isArray(collection) ? collection : [];

      await sql`
        INSERT INTO users (prenom, email, instagram, collection)
        VALUES (${prenom}, ${email}, ${instagram}, ${cards})
        ON CONFLICT (email) DO UPDATE SET
          prenom     = EXCLUDED.prenom,
          instagram  = EXCLUDED.instagram,
          collection = ARRAY(
            SELECT DISTINCT unnest(users.collection || EXCLUDED.collection)
          )
      `;

      return json({ success: true });
    }

    return json({ error: "Méthode non autorisée" }, 405);

  } catch (err) {
    console.error("CP9 API error:", err);
    return json({ error: err.message }, 500);
  }
};

// Déclare la route directement dans le fichier (alternative à netlify.toml)
export const config = { path: "/api" };
