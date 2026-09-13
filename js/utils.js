/* utils.js — Funções utilitárias puras: countWords, escapeHtml, splitSentences, tokenizeWords */

function countWords(t){
  return t.trim().length ? t.trim().split(/\s+/).length : 0;
}

function escapeHtml(s){
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function splitSentences(text){
  return text
    .replace(/\s+/g,' ')
    .trim()
    .split(/(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÀ0-9""(])/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function tokenizeWords(text){
  return (text.toLowerCase().match(/[a-zà-ÿ0-9]+(?:[''][a-zà-ÿ]+)?/gi) || []);
}
