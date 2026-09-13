/* render.js — Renderização do texto anotado: renderAnnotated */

function renderAnnotated(originalText, marcacoes){
  const found = [];
  const usedRanges = [];
  marcacoes.forEach((m) => {
    if(!m.trecho) return;
    const searchStr = m.trecho.trim();
    if(!searchStr) return;
    let startIdx = originalText.indexOf(searchStr);
    while(startIdx !== -1 && usedRanges.some(r => startIdx < r.end && startIdx + searchStr.length > r.start)){
      startIdx = originalText.indexOf(searchStr, startIdx + 1);
    }
    if(startIdx !== -1){
      const range = {start: startIdx, end: startIdx + searchStr.length, tipo: m.tipo, motivo: m.motivo, trecho: searchStr};
      usedRanges.push(range);
      found.push(range);
    }
  });
  found.sort((a,b) => a.start - b.start);

  let html = '';
  let cursor = 0;
  let noteCounter = 1;
  const noteMap = [];
  found.forEach(range => {
    if(range.start > cursor) html += escapeHtml(originalText.slice(cursor, range.start));
    const cls = range.tipo === 'geracao' ? 'ia' : (range.tipo === 'assistencia' ? 'assistencia' : 'humano');
    html += `<mark class="${cls}" title="${escapeHtml(range.motivo || '')}">${escapeHtml(originalText.slice(range.start, range.end))}</mark>`;
    noteMap.push({num: noteCounter, tipo: range.tipo, motivo: range.motivo, trecho: range.trecho});
    noteCounter++;
    cursor = range.end;
  });
  if(cursor < originalText.length) html += escapeHtml(originalText.slice(cursor));
  return { html, noteMap };
}
