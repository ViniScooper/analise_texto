/* app.js — Seletores DOM, event listeners e lógica principal do botão de análise */

const textarea = document.getElementById('inputText');
const wordCount = document.getElementById('wordCount');
const minWarning = document.getElementById('minWarning');
const runBtn = document.getElementById('runBtn');
const clearBtn = document.getElementById('clearBtn');
const statusText = document.getElementById('statusText');
const result = document.getElementById('result');
const errorBox = document.getElementById('errorBox');
const verdictTag = document.getElementById('verdictTag');
const summaryText = document.getElementById('summaryText');
const annotatedText = document.getElementById('annotatedText');
const notesList = document.getElementById('notesList');
const statsGrid = document.getElementById('statsGrid');
const refToggle = document.getElementById('refToggle');
const refBlock = document.getElementById('refBlock');
const refText = document.getElementById('refText');
const consistencySection = document.getElementById('consistencySection');
const consistencyBox = document.getElementById('consistencyBox');
const useBanner = document.getElementById('useBanner');
const rewriteBtn = document.getElementById('rewriteBtn');
const rewriteBox = document.getElementById('rewriteBox');
const rewriteText = document.getElementById('rewriteText');

textarea.addEventListener('input', () => {
  const n = countWords(textarea.value);
  wordCount.textContent = n + (n === 1 ? ' palavra' : ' palavras');
  minWarning.textContent = n > 0 && n < 80 ? 'recomenda-se pelo menos ~80 palavras para uma análise confiável' : '';
});

refToggle.addEventListener('click', () => {
  const showing = refBlock.classList.toggle('show');
  refToggle.textContent = showing ? '− ocultar comparação' : '+ comparar com um texto anterior do mesmo aluno';
});

clearBtn.addEventListener('click', () => {
  textarea.value = '';
  refText.value = '';
  wordCount.textContent = '0 palavras';
  minWarning.textContent = '';
  result.classList.remove('show');
  errorBox.classList.remove('show');
});

function useBannerInfo(classificacao){
  if(classificacao === 'geracao_provavel') return {cls:'use-concern', text:'Possível geração de conteúdo por IA — vale conversar com o aluno'};
  if(classificacao === 'assistencia_provavel') return {cls:'use-attn', text:'Padrão de assistência de IA (revisão/polimento) — ideias parecem do aluno'};
  return {cls:'use-ok', text:'Sem indícios relevantes de envolvimento de IA'};
}

function tagClassFor(level){
  if(level === 'alto') return 'tag-high';
  if(level === 'medio' || level === 'médio') return 'tag-mid';
  return 'tag-low';
}
function tagLabelFor(level){
  if(level === 'alto') return 'INDÍCIOS FORTES';
  if(level === 'medio' || level === 'médio') return 'INDÍCIOS MODERADOS';
  return 'POUCOS INDÍCIOS';
}

runBtn.addEventListener('click', async () => {
  const text = textarea.value.trim();
  const reference = refBlock.classList.contains('show') ? refText.value.trim() : '';
  errorBox.classList.remove('show');
  result.classList.remove('show');

  if(countWords(text) < 20){
    errorBox.textContent = "Cole um texto com pelo menos algumas frases para analisar.";
    errorBox.classList.add('show');
    return;
  }

  runBtn.disabled = true;
  statusText.textContent = "calculando métricas...";

  try{
    const stats = computeStylometrics(text);
    renderStats(stats);

    statusText.textContent = "analisando com IA...";
    const analysis = await analyzeText(text, stats);

    verdictTag.textContent = tagLabelFor(analysis.nivel);
    verdictTag.className = "verdict-tag " + tagClassFor(analysis.nivel);
    const bannerInfo = useBannerInfo(analysis.classificacao_uso);
    useBanner.textContent = bannerInfo.text;
    useBanner.className = "use-banner " + bannerInfo.cls;
    summaryText.textContent = analysis.resumo || "";

    const { html, noteMap } = renderAnnotated(text, analysis.marcacoes || []);
    annotatedText.innerHTML = html || escapeHtml(text);

    notesList.innerHTML = "";
    noteMap.forEach(note => {
      const li = document.createElement('li');
      const quoteClass = note.tipo === 'geracao' ? 'ia-quote' : (note.tipo === 'assistencia' ? 'assistencia-quote' : 'humano-quote');
      const tipoLabel = note.tipo === 'geracao' ? 'possível geração' : (note.tipo === 'assistencia' ? 'possível assistência' : 'sinal humano');
      li.innerHTML = `<span class="num">${note.num} · ${tipoLabel}</span>` +
        `<span class="quote ${quoteClass}">"${escapeHtml(note.trecho)}"</span>` +
        `<span>${escapeHtml(note.motivo || '')}</span>`;
      notesList.appendChild(li);
    });
    if(noteMap.length === 0){
      const li = document.createElement('li');
      li.textContent = "Nenhum trecho específico foi destacado nesta análise.";
      notesList.appendChild(li);
    }

    if(reference && countWords(reference) >= 20){
      statusText.textContent = "comparando com o texto de referência...";
      const comparison = await compareWithReference(text, reference);
      consistencySection.style.display = 'block';
      consistencyBox.innerHTML = `<strong>${comparison.consistente ? 'Estilo consistente' : 'Possível mudança de estilo'}</strong><br><br>${escapeHtml(comparison.explicacao || '')}`;
    } else {
      consistencySection.style.display = 'none';
    }

    result.classList.add('show');
    statusText.textContent = "";
  } catch(err){
    errorBox.textContent = "Erro ao analisar: " + err.message;
    errorBox.classList.add('show');
    statusText.textContent = "";
  } finally {
    runBtn.disabled = false;
  }
});

const rewriteLevel = document.getElementById('rewriteLevel');

rewriteBtn.addEventListener('click', async () => {
  const text = textarea.value.trim();
  if(!text) return;

  const level = rewriteLevel.value;

  rewriteBtn.disabled = true;
  const originalText = rewriteBtn.textContent;
  rewriteBtn.textContent = "Reescrevendo...";
  rewriteBox.style.display = 'none';

  try {
    const rewritten = await rewriteAsHuman(text, level);
    rewriteText.textContent = rewritten;
    rewriteBox.style.display = 'block';
  } catch(err) {
    alert("Erro ao reescrever: " + err.message);
  } finally {
    rewriteBtn.disabled = false;
    rewriteBtn.textContent = originalText;
  }
});

const copyRewriteBtn = document.getElementById('copyRewriteBtn');
copyRewriteBtn.addEventListener('click', async () => {
  const text = rewriteText.textContent;
  if(!text) return;
  
  try {
    await navigator.clipboard.writeText(text);
    const originalText = copyRewriteBtn.textContent;
    copyRewriteBtn.textContent = "Copiado!";
    setTimeout(() => {
      copyRewriteBtn.textContent = originalText;
    }, 2000);
  } catch (err) {
    alert("Não foi possível copiar o texto.");
  }
});
