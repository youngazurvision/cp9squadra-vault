const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function handleRegister(body) {
  const { prenom, email, instagram, newCards } = body;

  if (!prenom || !email) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "prenom et email requis" }) };
  }

  // 1. Get existing collection for merge
  const existing = await supabaseFetch(
    `/users?email=eq.${encodeURIComponent(email)}&select=collection&limit=1`
  );

  const existingCards = existing?.[0]?.collection;
  const safeExisting = Array.isArray(existingCards) ? existingCards : [];
  const safeIncoming = Array.isArray(newCards) ? newCards : [];
  const merged = [...new Set([...safeExisting, ...safeIncoming])];

  // 2. Upsert with onConflict=email
  const data = await supabaseFetch(`/users?on_conflict=email`, {
    method: "POST",
    headers: {
      Prefer: "return=representation,resolution=merge-duplicates",
    },
    body: JSON.stringify({ prenom, email, instagram, collection: merged }),
  });

  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ success: true, data }) };
}

async function handleCheck(body) {
  const { email } = body;

  if (!email) {
    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "email requis" }) };
  }

  const data = await supabaseFetch(
    `/users?email=eq.${encodeURIComponent(email)}&select=prenom,email,instagram,collection&limit=1`
  );

  const user = data?.[0] || null;
  return { statusCode: 200, headers: HEADERS, body: JSON.stringify({ user }) };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: HEADERS, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: HEADERS, body: JSON.stringify({ error: "POST only" }) };
  }

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: "Supabase non configuré (variables manquantes)" }),
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { action } = body;

    if (action === "register") return await handleRegister(body);
    if (action === "check") return await handleCheck(body);

    return { statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: "action invalide" }) };
  } catch (err) {
    console.error("[API] Error:", err.message);
    return {
      statusCode: 500,
      headers: HEADERS,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
