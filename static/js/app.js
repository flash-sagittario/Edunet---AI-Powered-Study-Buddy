/**
 * AI Study Buddy — Main Application Logic
 * EduNet Internship Project
 * Uses Anthropic Claude API (claude-haiku) with streaming
 */

// ── Navigation ──────────────────────────────────────────────
function show(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.getElementById('nav-' + page).classList.add('active');
}

// ── Chip (option) selection ──────────────────────────────────
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

// ── Claude API — Streaming (for text responses) ──────────────
async function askClaudeStream(prompt, onChunk) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      stream: true,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

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
      } catch (_) { /* skip malformed SSE lines */ }
    }
  }
  return fullText;
}

// ── Claude API — Non-streaming (for JSON responses) ──────────
async function askClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await res.json();
  return data.content.map(b => b.text || '').join('');
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
  navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard!'));
}

// ── Feature: Explain Topic ────────────────────────────────────
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
    `You are a friendly tutor. Explain "${topic}" to a ${level} in under 200 words. Use simple language and one real-world analogy.`,
    (text) => {
      setLoading('explain', false);
      body.textContent = text;
    }
  );

  btn.disabled = false;
}

// ── Feature: Summarize Notes ─────────────────────────────────
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
    `Summarize these study notes as ${style}. Be concise and clear.\n\nNotes:\n${notes.slice(0, 1500)}`,
    (text) => {
      setLoading('summarize', false);
      body.textContent = text;
    }
  );

  btn.disabled = false;
}

// ── Feature: Flashcards ───────────────────────────────────────
async function runFlashcards() {
  const topic = document.getElementById('flash-input').value.trim();
  if (!topic) return alert('Please enter a topic or paste notes!');

  const count = getSelected('flash-count');
  const btn   = document.querySelector('#page-flashcards .run-btn');
  const grid  = document.getElementById('flash-grid');

  btn.disabled = true;
  setCard('flash', true);
  setLoading('flash', true);
  grid.innerHTML = '';

  const raw = await askClaude(
    `Return ONLY a JSON array of ${count} flashcards, no markdown, no explanation.
Format: [{"front":"term or question (max 10 words)","back":"answer or definition (1-2 sentences)"},...]
Topic: ${topic}`
  );

  setLoading('flash', false);
  btn.disabled = false;

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const cards = JSON.parse(clean);

    cards.forEach(card => {
      grid.innerHTML += `
        <div class="flashcard" onclick="this.classList.toggle('flipped')">
          <div class="fc-inner">
            <div class="fc-front">
              ${card.front}
              <span class="fc-hint">tap to flip</span>
            </div>
            <div class="fc-back">${card.back}</div>
          </div>
        </div>`;
    });
  } catch (e) {
    grid.innerHTML = '<div style="padding:20px;color:var(--muted)">Could not parse cards. Please try again.</div>';
  }
}

// ── Feature: Quiz ─────────────────────────────────────────────
let quizAnswers  = [];
let quizScore    = 0;
let quizAnswered = 0;

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
  quizScore = 0;
  quizAnswered = 0;
  quizAnswers = [];

  const raw = await askClaude(
    `Return ONLY a JSON array of ${count} multiple choice questions, no markdown, no explanation.
Format: [{"question":"...","options":["A) ...","B) ...","C) ...","D) ..."],"answer":"A"},...]
The "answer" field must be just the letter A, B, C, or D.
Topic: ${topic}`
  );

  setLoading('quiz', false);
  btn.disabled = false;

  try {
    const clean = raw.replace(/```json|```/g, '').trim();
    const questions = JSON.parse(clean);

    questions.forEach((q, qi) => {
      quizAnswers.push(q.answer);
      const options = q.options.map((opt, oi) => {
        const letter = ['A', 'B', 'C', 'D'][oi];
        return `<button class="q-opt" onclick="answerQ(this, ${qi}, '${letter}', '${q.answer}')">${opt}</button>`;
      }).join('');

      wrap.innerHTML += `
        <div class="quiz-q" id="q-${qi}">
          <div class="q-text">${qi + 1}. ${q.question}</div>
          <div class="q-options">${options}</div>
        </div>`;
    });

    document.getElementById('quiz-score-bar').textContent = `0 / ${questions.length} correct`;
  } catch (e) {
    wrap.innerHTML = '<div style="padding:20px;color:var(--muted)">Could not load quiz. Please try again.</div>';
  }
}

function answerQ(btn, qi, chosen, correct) {
  const qDiv = document.getElementById('q-' + qi);
  const btns = qDiv.querySelectorAll('.q-opt');

  // Disable all options for this question
  btns.forEach(b => b.disabled = true);

  if (chosen === correct) {
    btn.classList.add('correct');
    quizScore++;
  } else {
    btn.classList.add('wrong');
    // Highlight the correct answer
    btns.forEach(b => {
      if (b.textContent.trim().startsWith(correct)) b.classList.add('correct');
    });
  }

  quizAnswered++;
  const total = quizAnswers.length;
  document.getElementById('quiz-score-bar').textContent = `${quizScore} / ${total} correct`;

  // Show final score when all answered
  if (quizAnswered === total) {
    setTimeout(() => {
      document.getElementById('score-num').textContent = `${quizScore}/${total}`;
      document.getElementById('quiz-score-panel').classList.add('show');
    }, 600);
  }
}
