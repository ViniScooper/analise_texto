/* api.js — Chama o servidor local (/api/chat) que faz proxy para a DeepSeek.
   A chave de API fica no .env do servidor — nunca exposta no browser. */

async function callClaude(systemPrompt, userContent, maxTokens){
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent  }
      ]
    })
  });
  if(!response.ok){
    const errData = await response.json().catch(() => ({}));
    throw new Error("Erro no servidor: " + (errData.error || response.status));
  }
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if(!raw) throw new Error("Resposta inesperada da API.");
  let clean = raw.trim().replace(/^```json/i, "").replace(/^```/, "").replace(/```$/, "").trim();
  try{
    return JSON.parse(clean);
  } catch(e){
    throw new Error("Não foi possível interpretar a resposta da análise.");
  }
}

async function analyzeText(text, stats){
  const systemPrompt = `Você é um assistente que ajuda professores a identificar QUALITATIVAMENTE trechos de um texto de aluno que apresentam indícios de envolvimento de IA. Você NÃO é um detector confiável e deve manter uma postura cautelosa e criteriosa.

DISTINÇÃO CENTRAL — a mais importante deste trabalho: nem todo uso de IA é equivalente. Um aluno que usa IA para revisar gramática, melhorar a fluidez de frases que ele mesmo escreveu, ou reorganizar um parágrafo já pensado por ele está se beneficiando de uma ferramenta legítima de apoio — isso não deveria ser tratado como cola. Já um trecho cujo CONTEÚDO (as ideias, os argumentos, os exemplos) parece ter sido gerado pela IA, e não apenas seu texto polido, é uma situação diferente e mais preocupante. Sua tarefa é ajudar o professor a distinguir essas duas situações, não tratá-las como a mesma coisa.

Use três categorias de marcação:
- "geracao": o CONTEÚDO do trecho (ideia, argumento, análise, exemplo) parece ter sido criado pela IA, não apenas o texto. Ex: um argumento genérico e "de manual" que não parece vir de alguém pensando sobre o tema específico da tarefa.
- "assistencia": o trecho parece ter sido revisado, reformulado ou polido por IA a partir de uma ideia que plausivelmente já era do aluno — a estrutura de pensamento parece pessoal, mas a redação está artificialmente "lisa" (vocabulário raro para o nível do aluno, transições longe do resto do texto, frase isolada com fluência muito acima do restante).
- "humano": sinal claro de escrita humana genuína (opinião específica, digressão, imperfeição genuína, referência pessoal concreta).

Para decidir entre "geracao" e "assistencia", pergunte-se: esse trecho parece um pensamento genérico que qualquer aluno de qualquer turma poderia ter recebido pronto (geração), ou parece uma ideia específica ao contexto da tarefa/aluno só que com a redação mais polida que o resto do texto (assistência)? Na dúvida entre as duas, prefira "assistencia" — o ônus da dúvida deve favorecer não penalizar o aluno.

Você recebeu também métricas estilométricas já calculadas do texto (variação no tamanho das frases e diversidade de vocabulário). Use-as como contexto adicional, mas não como única base — métricas sozinhas não são conclusivas.

Responda APENAS com um objeto JSON válido, sem markdown, sem texto antes ou depois, no formato exato:
{
  "nivel": "baixo" | "medio" | "alto",
  "classificacao_uso": "sem_indicios" | "assistencia_provavel" | "geracao_provavel",
  "resumo": "parágrafo curto (2-3 frases) com o parecer geral, cauteloso, explicando a natureza predominante do uso (assistência vs. geração) e mencionando brevemente se as métricas reforçam ou contradizem os indícios qualitativos",
  "marcacoes": [
    {
      "trecho": "cópia EXATA de um trecho contínuo do texto original, palavra por palavra, sem alterar nada",
      "tipo": "geracao" | "assistencia" | "humano",
      "motivo": "explicação curta e específica de por que esse trecho foi marcado nessa categoria"
    }
  ]
}

Regras: "trecho" deve ser cópia literal exata (para localização por busca de texto). Marque de 3 a 10 trechos. Inclua pelo menos 1 "humano" se houver qualquer sinal, mesmo fraco. "classificacao_uso" deve refletir o padrão predominante: se a maioria das marcações de IA forem "assistencia", use "assistencia_provavel"; se houver marcações claras de "geracao", use "geracao_provavel"; se não houver marcações de IA relevantes, use "sem_indicios". Não marque o texto inteiro. Trechos não devem se sobrepor.`;

  const statsContext = `Métricas já calculadas deste texto: variação entre frases (coeficiente de variação) = ${stats.cv.toFixed(2)} (valores abaixo de 0.35 tendem a indicar uniformidade suspeita); diversidade de vocabulário = ${(stats.ttr*100).toFixed(0)}% de palavras únicas; ${stats.sentCount} frases, ${stats.wordCount} palavras.`;

  return callClaude(systemPrompt, `${statsContext}\n\nAnalise o texto abaixo e marque os trechos relevantes:\n\n"""${text}"""`, 1800);
}

async function compareWithReference(text, reference){
  const systemPrompt = `Você compara dois textos para avaliar se parecem ter sido escritos pela mesma pessoa, no mesmo estilo natural. O primeiro é o texto em avaliação; o segundo é uma amostra de referência de autoria confirmada do mesmo aluno. Avalie consistência de vocabulário, complexidade sintática, tom, tipo de erro (ou ausência de erros) e voz pessoal. Uma mudança brusca de estilo entre os dois é um sinal relevante — mais relevante, geralmente, do que analisar um texto isolado.

Responda APENAS com um objeto JSON válido, sem markdown, no formato exato:
{
  "consistente": true | false,
  "explicacao": "parágrafo curto (2-4 frases) explicando se o estilo é consistente entre os dois textos e por quê, citando diferenças ou semelhanças concretas"
}`;

  return callClaude(systemPrompt, `TEXTO EM AVALIAÇÃO:\n"""${text}"""\n\nTEXTO DE REFERÊNCIA (autoria confirmada):\n"""${reference}"""`, 700);
}

async function rewriteAsHuman(text){
  const systemPrompt = `Você é um assistente usado por professores para fins DIDÁTICOS: reescrever um texto de forma que apresente marcas típicas de escrita humana genuína, para mostrar aos alunos como seria um texto mais autêntico.

Seu objetivo é reescrever o texto aplicando estas técnicas:
1. VARIAÇÃO DE TAMANHO DE FRASES: alterne entre frases curtas, médias e longas. Não deixe todas as frases com tamanho parecido.
2. VOZ PESSOAL: adicione expressões de opinião genuína ("eu acho que", "na minha visão", "me parece que"), digressões curtas, hesitações naturais.
3. IMPERFEIÇÕES GENUÍNAS: inclua algumas repetições leves de palavra, construções menos formais, conectivos simples ("mas", "e aí", "por isso").
4. VOCABULÁRIO ACESSÍVEL: substitua termos excessivamente formais ou raros por sinônimos mais comuns e naturais para o nível provável do texto.
5. REFERÊNCIAS CONCRETAS: onde o texto for genérico demais, torne mais específico e situado.
6. RITMO IRREGULAR: quebre a uniformidade — use às vezes uma frase curta, ou um parágrafo bem curto logo após um longo.

Mantenha o CONTEÚDO e as IDEIAS principais do texto original. Não invente informações novas. Apenas reescreva o estilo.
Responda APENAS com o texto reescrito, sem explicações, sem cabeçalhos, sem aspas envolvendo o texto.`;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      max_tokens: 2000,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user",   content: `Reescreva com marcas de escrita humana genuína:\n\n"""\n${text}\n"""` }
      ]
    })
  });
  if(!response.ok){
    const errData = await response.json().catch(() => ({}));
    throw new Error("Erro ao humanizar: " + (errData.error || response.status));
  }
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if(!raw) throw new Error("Resposta vazia da API.");
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

