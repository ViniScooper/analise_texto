/* stylometrics.js — Análise estilométrica local: computeStylometrics, cvNote, ttrNote, renderStats */

// ---- Local stylometric analysis (no API call, fully deterministic) ----
function computeStylometrics(text){
  const sentences = splitSentences(text);
  const words = tokenizeWords(text);
  const wordCountN = words.length;
  const sentCountN = sentences.length || 1;

  const sentLengths = sentences.map(s => tokenizeWords(s).length).filter(n => n > 0);
  const avgSentLen = sentLengths.reduce((a,b)=>a+b,0) / (sentLengths.length || 1);
  const variance = sentLengths.reduce((a,b)=>a + Math.pow(b-avgSentLen,2), 0) / (sentLengths.length || 1);
  const stdDev = Math.sqrt(variance);
  // burstiness-like coefficient of variation
  const cv = avgSentLen > 0 ? (stdDev / avgSentLen) : 0;

  const uniqueWords = new Set(words);
  const ttr = wordCountN > 0 ? uniqueWords.size / wordCountN : 0;

  const avgWordLen = wordCountN > 0 ? words.reduce((a,w)=>a+w.length,0) / wordCountN : 0;

  return {
    wordCount: wordCountN,
    sentCount: sentCountN,
    avgSentLen,
    stdDevSentLen: stdDev,
    cv,
    ttr,
    avgWordLen
  };
}

function cvNote(cv){
  if(cv < 0.35) return {note:'baixa variação — sinal possível de IA', flag:'stat-flag-mid'};
  if(cv < 0.5) return {note:'variação moderada', flag:''};
  return {note:'alta variação — típico de escrita humana', flag:''};
}
function ttrNote(ttr){
  if(ttr > 0.75) return {note:'vocabulário bem variado', flag:''};
  if(ttr > 0.55) return {note:'variação moderada', flag:''};
  return {note:'vocabulário repetitivo', flag:'stat-flag-mid'};
}

function renderStats(stats){
  const cvInfo = cvNote(stats.cv);
  const ttrInfo = ttrNote(stats.ttr);
  const cells = [
    {label:'PALAVRAS', value: stats.wordCount, note:''},
    {label:'FRASES', value: stats.sentCount, note:''},
    {label:'TAMANHO MÉDIO DE FRASE', value: stats.avgSentLen.toFixed(1) + ' palavras', note:''},
    {label:'VARIAÇÃO ENTRE FRASES', value: stats.cv.toFixed(2), note: cvInfo.note, flag: cvInfo.flag},
    {label:'DIVERSIDADE DE VOCABULÁRIO', value: (stats.ttr*100).toFixed(0) + '%', note: ttrInfo.note, flag: ttrInfo.flag},
    {label:'TAMANHO MÉDIO DE PALAVRA', value: stats.avgWordLen.toFixed(1) + ' letras', note:''}
  ];
  statsGrid.innerHTML = cells.map(c => `
    <div class="stat-cell ${c.flag || ''}">
      <span class="stat-label">${c.label}</span>
      <span class="stat-value">${c.value}</span>
      ${c.note ? `<span class="stat-note">${c.note}</span>` : ''}
    </div>
  `).join('');
}
