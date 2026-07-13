import OpenAI from "openai";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });

export interface DevisLine {
  description: string;
  quantite: number;
  unite: string;
  prix_unitaire: number;
  montant_ligne: number;
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const file = new File([audioBlob], "audio.webm", {
    type: audioBlob.type || "audio/webm",
  });
  const result = await openai.audio.transcriptions.create({
    file,
    model: "whisper-1",
  });
  return result.text;
}

export async function extractDevisLines(transcript: string): Promise<DevisLine[]> {
  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content:
          "Tu extrais les lignes d'un devis CVC (chauffage, ventilation, climatisation) " +
          "à partir de la transcription d'une note vocale d'un artisan. Une ligne par " +
          "prestation ou fourniture mentionnée, avec quantité, unité, prix unitaire HT " +
          "et montant total de la ligne HT (montant_ligne = quantite * prix_unitaire).",
      },
      { role: "user", content: transcript },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "devis_lines",
        strict: true,
        schema: {
          type: "object",
          properties: {
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  description: { type: "string" },
                  quantite: { type: "number" },
                  unite: { type: "string" },
                  prix_unitaire: { type: "number" },
                  montant_ligne: { type: "number" },
                },
                required: ["description", "quantite", "unite", "prix_unitaire", "montant_ligne"],
                additionalProperties: false,
              },
            },
          },
          required: ["lines"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = completion.choices[0].message.content;
  if (!content) throw new Error("Réponse GPT-4o vide.");
  return (JSON.parse(content) as { lines: DevisLine[] }).lines;
}
