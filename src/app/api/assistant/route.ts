import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/security";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) })).min(1).max(20),
  page: z.string().max(120).optional(),
});

const SYSTEM_PROMPT = `Você é o assistente do Nexo Público, plataforma de inteligência de mercado para licitações públicas brasileiras. Responda sempre em português do Brasil, de forma direta e prática.
Regras:
- Você NÃO tem acesso aos dados da conta nem às licitações; não invente números, processos, órgãos, preços ou prazos. Quando faltar dado, diga isso e aponte a tela do Nexo onde o usuário encontra a informação.
- Telas do Nexo: Hoje (painel do dia), Licitações (busca com filtros de UF, valor, modo de disputa, ME/EPP), Preços por região (preço por produto, estado e município a partir do catálogo CATMAT/CATSER), Disputa (copiloto: piso, próximo lance e hora de parar; o lance é digitado pelo usuário no portal), Alertas, Funil, Checklist, Agenda, Concorrentes, Órgãos, Jurídico.
- Explique conceitos de licitação (Lei 14.133/2021, pregão eletrônico, dispensa, registro de preços, ME/EPP, habilitação, impugnação, recurso) com clareza. Para prazos e exigências legais de um caso concreto, recomende conferir o edital e consultar um profissional habilitado.
- Nunca ajude a burlar regras de disputa, combinar preços, fraudar documentos ou contornar bloqueios de portais.
- Respostas curtas; use listas quando ajudar.`;

const MODELS = [process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest", "gemini-flash-lite-latest", "gemini-3-flash-preview"];

async function askGemini(apiKey: string, body: unknown) {
  let lastStatus = 0;
  for (const model of [...new Set(MODELS)]) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      }).catch(() => null);
      if (response?.ok) return response.json() as Promise<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>;
      lastStatus = response?.status ?? 0;
      if (lastStatus !== 503 && lastStatus !== 429 && lastStatus !== 0) break;
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
    }
  }
  throw new Error(`GEMINI_${lastStatus}`);
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json({ message: "Origem inválida." }, { status: 403 });
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ message: "O assistente ainda não foi configurado neste ambiente." }, { status: 503 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ message: "Sessão necessária." }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ message: "Mensagem inválida." }, { status: 400 });

  const { messages, page } = parsed.data;
  try {
    const result = await askGemini(apiKey, {
      systemInstruction: { parts: [{ text: `${SYSTEM_PROMPT}${page ? `\nO usuário está na tela: ${page}.` : ""}` }] },
      contents: messages.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      generationConfig: { temperature: 0.4, maxOutputTokens: 1200 },
    });
    const text = result.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) return NextResponse.json({ message: "O assistente não conseguiu responder. Reformule a pergunta." }, { status: 502 });
    return NextResponse.json({ reply: text }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const busy = error instanceof Error && /GEMINI_(503|429)/.test(error.message);
    return NextResponse.json({ message: busy ? "O serviço de IA está sobrecarregado agora. Tente de novo em instantes." : "Não foi possível falar com o assistente agora." }, { status: 502 });
  }
}
