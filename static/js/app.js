/**
 * AI Study Buddy — Main Application Logic
 * EduNet Internship Project
 */

// ── API Key Setup ─────────────────────────────────────────────
let API_KEY = '';

function getApiKey() {
  if (!API_KEY) {
    API_KEY = prompt(
      '🔑 Enter your Anthropic API Key to use AI features.\n\nGet one free at: console.anthropic.com\n\n(Stored only in this browser tab, never saved anywhere)'
    ) || '';
  }
  return API_KEY;
}

// ── Navigation ────────────────────────────────────────────────
function show(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');
}

// ── Chip selection ────────────────────────────────────────────
document.querySelectorAll('.options-row').forEach(row => {
  row.querySelectorAll('.opt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      row.querySelectorAll('.opt-chip').forEach(c => c.classList.remove('sel'));
      chip.classList.add('sel');
    });
  });
});

function getSelected(rowId) {
  const chip = document.querySelector('#' + rowId + ' .opt-chip.sel');
  return chip ? chip.dataset.val : '';
}

// ── Claude API — Streaming ────────────────────────────────────
async function askClaudeStream(prompt, onChunk) {
  const key = getApiKey();
  if (!key) { onChunk('No API key provided. Please refresh and enter your key.'); return; }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 400,
        stream:     true,
        messages:   [{ role: 'user', content: prompt }]
      })
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      onChunk('API Error: ' + (err?.error?.message || res.statusText));
      return;
    }

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const evt = JSON.parse(data);
          if (evt.type === 'content_block_delta' && evt.delta?.text) {
            fullText += evt.delta.text;
            onChunk(fullText);
          }
        } catch (_) {}
      }
    }
    return fullText;

  } catch (err) {
    clearTimeout(timeout);
    onChunk(err.name === 'AbortError' ? 'Request timed out. Please try again.' : 'Network error: ' + err.message);
  }
}

// ── Claude API — Non-streaming (JSON) ────────────────────────
async function askClaude(prompt) {
  const key = getApiKey();
  if (!key) return '[]';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages:   [{ role: 'user', content: prompt }]
      })
    });

    clearTimeout(timeout);
    if (!res.ok) return '[]';
    const data = await res.json();
    return data.content.map(b => b.text || '').join('');

  } catch (err) {
    clearTimeout(timeout);
    return '[]';
  }
}

// ── UI Helpers ────────────────────────────────────────────────
function setLoading(id, visible) {
  document.getElementById(id + '-load').classList.toggle('show', visible);
}
function setCard(id, visible) {
  document.getElementById(id + '-out').classList.toggle('show', visible);
}
function copyText(id) {
  const text = document.getElementById(id).textContent;
  navigator.clipboard.writeText(text).then(() => alert('Copied!'));
}

// ── Explain ───────────────────────────────────────────────────
async function runExplain() {
  const topic = document.getElementById('explain-input').value.trim();
  if (!topic) return alert('Please enter a topic!');
  const level = getSelected('explain-level');
  const btn   = document.querySelector('#page-explain .run-btn');
  const body  = document.getElementById('explain-body');
  btn.disabled = true;
  setCard('explain', true);
  setLoading('explain', true);
  body.textContent = '';
  await askClaudeStream(
    `Explain "${topic}" to a ${level} in under 150 words. Simple language, one analogy.`,
    (text) => { setLoading('explain', false); body.textContent = text; }
  );
  btn.disabled = false;
}

// ── Summarize ─────────────────────────────────────────────────
async function runSummarize() {
  const notes = document.getElementById('summarize-input').value.trim();
  if (!notes) return alert('Please paste some notes!');
  const style = getSelected('summarize-style');
  const btn   = document.querySelector('#page-summarize .run-btn');
  const body  = document.getElementById('summarize-body');
  btn.disabled = true;
  setCard('summarize', true);
  setLoading('summarize', true);
  body.textContent = '';
  await askClaudeStream(
    `Summarize as ${style}. Be brief.\n\nNotes:\n${notes.slice(0, 1200)}`,
    (text) => { setLoading('summarize', false); body.textContent = text; }
  );
  btn.disabled = false;
}

// ── Flashcards ────────────────────────────────────────────────
async function runFlashcards() {
  const topic = document.getElementById('flash-input').value.trim();
  if (!topic) return alert('Please enter a topic!');
  const count = getSelected('flash-count');
  const btn   = document.querySelector('#page-flashcards .run-btn');
  const grid  = document.getElementById('flash-grid');
  btn.disabled = true;
  setCard('flash', true);
  setLoading('flash', true);
  grid.innerHTML = '';

  const raw = await askClaude(
    `JSON array of ${count} flashcards. No markdown. Format: [{"front":"term","back":"definition"},...] Topic: ${topic}`
  );

  setLoading('flash', false);
  btn.disabled = false;

  try {
    const cards = JSON.parse(raw.replace(/```json|```/g, '').trim());
    cards.forEach(c => {
      grid.innerHTML += `
        <div class="flashcard" onclick="this.classList.toggle('flipped')">
          <div class="fc-inner">
            <div class="fc-front">${c.front}<span class="fc-hint">tap to flip</span></div>
            <div class="fc-back">${c.back}</div>
          </div>
        </div>`;
    });
  } catch {
    grid.innerHTML = '<div style="padding:20px;color:var(--muted)">Could not load cards. Try again.</div>';
  }
}

// ── Quiz ──────────────────────────────────────────────────────
let quizAnswers = [], quizScore = 0, quizAnswered = 0;

async function runQuiz() {
  const topic = document.getElementById('quiz-input').value.trim();
  if (!topic) return alert('Please enter a topic!');
  const count = getSelected('quiz-count');
  const btn   = document.querySelector('#page-quiz .run-btn');
  const wrap  = document.getElementById('quiz-wrap');
  btn.disabled = true;
  setCard('quiz', true);
  setLoading('quiz', true);
  wrap.innerHTML = '';
  document.getElementById('quiz-score-panel').classList.remove('show');
  document.getElementById('quiz-score-bar').textContent = '';
  quizScore = 0; quizAnswered = 0; quizAnswers = [];

  const raw = await askClaude(
    `JSON array of ${count} MCQs. No markdown. Format: [{"question":"...","options":["A)...","B)...","C)...","D)..."],"answer":"A"},...] Topic: ${topic}`
  );

  setLoading('quiz', false);
  btn.disabled = false;

  try {
    const qs = JSON.parse(raw.replace(/```json|```/g, '').trim());
    qs.forEach((q, qi) => {
      quizAnswers.push(q.answer);
      const opts = q.options.map((o, oi) => {
        const letter = ['A','B','C','D'][oi];
        return `<button class="q-opt" onclick="answerQ(this,${qi},'${letter}','${q.answer}')">${o}</button>`;
      }).join('');
      wrap.innerHTML += `
        <div class="quiz-q" id="q-${qi}">
          <div class="q-text">${qi+1}. ${q.question}</div>
          <div class="q-options">${opts}</div>
        </div>`;
    });
    document.getElementById('quiz-score-bar').textContent = `0 / ${qs.length} correct`;
  } catch {
    wrap.innerHTML = '<div style="padding:20px;color:var(--muted)">Could not load quiz. Try again.</div>';
  }
}

function answerQ(btn, qi, chosen, correct) {
  const qDiv = document.getElementById('q-' + qi);
  const btns = qDiv.querySelectorAll('.q-opt');
  btns.forEach(b => b.disabled = true);
  if (chosen === correct) { btn.classList.add('correct'); quizScore++; }
  else {
    btn.classList.add('wrong');
    btns.forEach(b => { if (b.textContent.trim().startsWith(correct)) b.classList.add('correct'); });
  }
  quizAnswered++;
  document.getElementById('quiz-score-bar').textContent = `${quizScore} / ${quizAnswers.length} correct`;
  if (quizAnswered === quizAnswers.length) {
    setTimeout(() => {
      document.getElementById('score-num').textContent = `${quizScore}/${quizAnswers.length}`;
      document.getElementById('quiz-score-panel').classList.add('show');
    }, 600);
  }
}
