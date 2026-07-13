// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "@supabase/server";
import { corsHeaders } from "../_shared/cors.ts";
import { extractDevisLines, transcribeAudio } from "./openai.ts";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // limite de l'API Whisper

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export default {
  // auth: "user" => le runtime valide le JWT (verify_jwt = true dans
  // config.toml) avant même d'appeler ce handler, et expose l'identité
  // de l'utilisateur + un client Supabase scopé par ses policies RLS.
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return json(405, { error: "Méthode non autorisée." });
    }

    let body: { audio_path?: string; client_id?: string };
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Corps de requête JSON invalide." });
    }

    const { audio_path, client_id } = body;
    if (!audio_path || !client_id) {
      return json(400, { error: "audio_path et client_id sont requis." });
    }

    // company_id n'est jamais pris depuis le payload (voir spec) : on le
    // dérive du JWT de l'appelant via sa propre ligne users (autorisée
    // par la policy users_select : id = auth.uid()).
    const { data: userRow, error: userRowErr } = await ctx.supabase
      .from("users")
      .select("company_id")
      .eq("id", ctx.userClaims!.id)
      .single();
    if (userRowErr || !userRow?.company_id) {
      return json(403, { error: "Utilisateur non rattaché à une entreprise." });
    }
    const companyId = userRow.company_id as string;

    // ctx.supabase est scopé par les policies RLS de l'utilisateur : si
    // client_id n'appartient pas à sa company, la policy clients_all le
    // filtre automatiquement et cette requête ne renvoie rien.
    const { data: clientRow } = await ctx.supabase
      .from("clients")
      .select("id")
      .eq("id", client_id)
      .maybeSingle();
    if (!clientRow) {
      return json(403, { error: "Ce client n'appartient pas à votre entreprise." });
    }

    // Garde défensive supplémentaire sur la convention de chemin du bucket.
    if (!audio_path.startsWith(`${companyId}/`)) {
      return json(403, { error: "Chemin audio non autorisé pour cette entreprise." });
    }

    // Le bucket devis-audio est privé et n'a pas encore de policy Storage
    // pour l'utilisateur (Étape 3) : on télécharge via supabaseAdmin, qui
    // bypasse RLS/Storage policies.
    const { data: audioBlob, error: downloadErr } = await ctx.supabaseAdmin.storage
      .from("devis-audio")
      .download(audio_path);
    if (downloadErr || !audioBlob) {
      return json(400, { error: "Fichier audio introuvable dans le stockage." });
    }
    if (audioBlob.size > MAX_AUDIO_BYTES) {
      return json(400, {
        error: "Le fichier audio dépasse la taille maximale autorisée (25 Mo).",
      });
    }

    let transcript: string;
    try {
      transcript = await transcribeAudio(audioBlob);
    } catch {
      return json(502, { error: "Échec de la transcription audio." });
    }

    let lines;
    try {
      lines = await extractDevisLines(transcript);
    } catch {
      return json(502, { error: "Échec de l'extraction des lignes du devis." });
    }

    // Insert devis + devis_lines en une transaction atomique (voir
    // migration 0002) : soit tout est créé, soit rien ne l'est.
    const { data: rpcData, error: rpcErr } = await ctx.supabaseAdmin.rpc(
      "create_devis_with_lines",
      {
        p_company_id: companyId,
        p_client_id: client_id,
        p_source: "vocal",
        p_transcript: transcript,
        p_audio_path: audio_path,
        p_lines: lines,
      },
    );
    if (rpcErr || !rpcData?.[0]) {
      return json(500, { error: "Échec de la création du devis." });
    }

    const { devis_id, numero } = rpcData[0];
    return json(200, { devis_id, numero });
  }),
};
