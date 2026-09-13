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

async function rewriteAsHuman(text, level = 'extremo'){
  let rules = '';

  if (level === 'leve') {
    rules = `1. VARIAÇÃO LEVE: Alterne sutilmente o tamanho das frases.
2. REMOÇÃO DE CLICHÊS ROBÓTICOS: Remova inícios de frase óbvios de IA como "Em conclusão", "É crucial notar", "Além disso". Use o fluxo lógico da frase.
3. TOM: Mantenha o texto limpo, formal e super bem estruturado, como uma redação ou artigo acadêmico excelente. Não tente forçar informalidade.`;
  } else if (level === 'moderado') {
    rules = `1. EXPLOSIVIDADE (BURSTINESS): Varie consideravelmente o tamanho das frases. Intercale frases longas com curtas.
2. PERPLEXIDADE: Evite as palavras estatisticamente mais óbvias. Substitua vocabulário padrão da IA por sinônimos adequados, mas sem soar rebuscado demais.
3. TRANSIÇÕES ORGÂNICAS: Conecte ideias com a própria narrativa, abandonando transições clássicas (Ademais, Em suma).
4. ESTRUTURA: Mantenha a formalidade, mas adicione um ritmo genuinamente humano.`;
  } else {
    rules = `1. QUEBRA DE PARALELISMO SINTÁTICO: IAs amam estruturas simétricas ("para melhorar a saúde e para aumentar a autoestima"). Quebre isso sempre. Exemplo: mude para "além de uma melhora clara na saúde, nota-se que a autoestima acaba subindo junto".
2. EXPLOSIVIDADE CAÓTICA (BURSTINESS): Force um ritmo irregular ao extremo. Faça uma frase minúscula, de 3 a 5 palavras. A seguinte deve ser imensa, com 40 palavras, contendo digressões ou cláusulas subordinadas.
3. PERPLEXIDADE MÁXIMA E ANCORAGEM: Não use a palavra mais provável. Substitua estruturas verbais comuns por nominalizações ou verbos de baixa frequência. 
4. PROIBIÇÃO DE CLICHÊS: É ESTRITAMENTE PROIBIDO usar transições robóticas: "Além disso", "Ademais", "Em conclusão", "É importante ressaltar", "Nesse contexto", "Em suma", "Portanto". Conecte as ideias de forma abrupta ou com conjunções deslocadas.
5. PONTUAÇÃO HUMANA (CAUDA LONGA): IAs usam apenas ponto e vírgula convencional. Você deve usar travessões (—) para intercalar pensamentos, usar ponto e vírgula (;) de forma orgânica e colocar pequenos adendos entre parênteses.
6. IMPERFEIÇÃO CALCULADA: Humanos dão "voltas" para explicar algo. Use construções como "O que acaba acontecendo é que", "Fato é que", "Acaba sendo". A coesão deve vir do fluxo do pensamento, não de conectivos perfeitos.`;
  }

  const systemPrompt = `Você é um especialista em reescrita estrutural. Seu objetivo é reescrever o texto fornecido para que passe em detectores anti-IA (GPTZero, Turnitin, Scribbr), simulando um cérebro humano. Mantenha o significado central, os dados e o tom geral.

Siga estas regras rigorosamente:
${rules}

Não force informalidade barata (não use gírias). Apenas faça a sintaxe parecer profundamente humana.
Responda APENAS com o texto reescrito, sem introduções.`;

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

