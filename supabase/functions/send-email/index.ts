// Supabase Edge Function: send-email
// Sends transactional emails via the Resend API.
// Deploy with:  supabase functions deploy send-email
//
// IMPORTANT (Resend): the `from` address MUST use a domain verified in Resend
// (e.g. planetraves.fr). You cannot send `from` a moderator's personal address.
// To let recipients reply to the acting moderator, pass their address as `replyTo`,
// which becomes the Reply-To header.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
    "https://planetraves.fr",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
];

// Minimum profile role allowed to send: 2 = Moderator (see APP_CONFIG.ROLES).
const MIN_ROLE = 2;

// Default sender — must be on your Resend-verified domain.
const DEFAULT_FROM = "Planet Raves <noreply@planetraves.fr>";

function corsHeaders(origin: string | null) {
    const allow = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        "Access-Control-Allow-Origin": allow,
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };
}

Deno.serve(async (req) => {
    const origin = req.headers.get("origin");
    const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

    if (req.method === "OPTIONS") {
        return new Response("ok", { headers });
    }
    if (req.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    }

    // --- Auth: require a signed-in user with a moderator role (>= MIN_ROLE) ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
        return new Response(JSON.stringify({ error: "Missing Authorization header" }), { status: 401, headers });
    }
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return new Response(JSON.stringify({ error: "Invalid or expired session" }), { status: 401, headers });
    }
    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (profileError || !profile || profile.role < MIN_ROLE) {
        return new Response(JSON.stringify({ error: "Forbidden: moderator role required" }), { status: 403, headers });
    }

    let payload: { to?: string; subject?: string; body?: string; from?: string; replyTo?: string };
    try {
        payload = await req.json();
    } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers });
    }

    const { to, subject, body, replyTo } = payload;
    if (!to || !subject || !body) {
        return new Response(JSON.stringify({ error: "Missing to/subject/body" }), { status: 400, headers });
    }

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) {
        return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), { status: 500, headers });
    }

    const from = payload.from || Deno.env.get("RESEND_FROM") || DEFAULT_FROM;

    const emailPayload: Record<string, unknown> = {
        from,
        to,
        subject,
        text: body,               // plain-text body (your templates are plain text)
    };
    if (replyTo) emailPayload.reply_to = replyTo;

    try {
        const res = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(emailPayload),
        });

        const data = await res.json();
        if (!res.ok) {
            console.error("Resend send failed:", data);
            return new Response(JSON.stringify({ error: data }), { status: res.status, headers });
        }
        return new Response(JSON.stringify({ success: true, id: data.id }), { status: 200, headers });
    } catch (err) {
        console.error("Resend request error:", err);
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers });
    }
});

/*
Configure once (Supabase CLI):

  supabase secrets set RESEND_API_KEY=re_xxxxxxxx RESEND_FROM="Planet Raves <noreply@planetraves.fr>"

Then deploy:
  supabase functions deploy send-email

Notes:
- The `from` domain (planetraves.fr) must be verified in Resend (Domains -> add + DNS records).
- `replyTo` is set to the acting moderator's email so recipients reply directly to them.
- This function is called from the browser with the anon key. To restrict it to
  signed-in moderators, verify the JWT / role from the Authorization header here.
*/
