// 병원 길잡이 화면 동작: 음성 입력 → 서버 질문 → 답 읽어 주기 → 병원/서류 카드 표시

const $ = (sel) => document.querySelector(sel);
const chat = $('#chat');

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 못 해도 동작에는 지장 없음 */ }
  },
};

const state = {
  history: [],
  location: null,
  area: store.get('area', ''),
  busy: false,
};

// ---------- 글자 크기 ----------
const FONT_STEPS = ['', 'font-l', 'font-xl'];
let fontStep = store.get('fontStep', 0);
function applyFont() {
  document.documentElement.classList.remove('font-l', 'font-xl');
  if (FONT_STEPS[fontStep]) document.documentElement.classList.add(FONT_STEPS[fontStep]);
}
applyFont();
$('#font-btn').addEventListener('click', () => {
  fontStep = (fontStep + 1) % FONT_STEPS.length;
  store.set('fontStep', fontStep);
  applyFont();
});

// ---------- 소리로 읽어 주기 ----------
const ttsToggle = $('#tts-toggle');
ttsToggle.checked = store.get('tts', true);
ttsToggle.addEventListener('change', () => {
  store.set('tts', ttsToggle.checked);
  if (!ttsToggle.checked) window.speechSynthesis?.cancel();
});

function speak(text, force = false) {
  if (!('speechSynthesis' in window) || (!ttsToggle.checked && !force)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  u.rate = 0.9;
  const voice = window.speechSynthesis.getVoices().find((v) => v.lang?.startsWith('ko'));
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

// ---------- 위치 ----------
function renderLocation() {
  const text = $('#location-text');
  if (state.location) text.textContent = '내 위치 기준으로 찾아요';
  else if (state.area) text.textContent = `${state.area} 기준으로 찾아요`;
  else text.textContent = '위치를 모르면 동네를 알려 주세요';
}

function locate() {
  if (!navigator.geolocation) { renderLocation(); return; }
  $('#location-text').textContent = '위치를 확인하고 있어요…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.location = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      renderLocation();
    },
    () => {
      state.location = null;
      renderLocation();
      if (!state.area) openAreaDialog();
    },
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
  );
}

const dialog = $('#area-dialog');
function openAreaDialog() {
  $('#area-input').value = state.area;
  if (typeof dialog.showModal === 'function') dialog.showModal();
}
$('#area-btn').addEventListener('click', openAreaDialog);
dialog.addEventListener('close', () => {
  if (dialog.returnValue === 'save') {
    state.area = $('#area-input').value.trim();
    store.set('area', state.area);
    // 동네를 직접 고르면 그 동네 기준으로 찾는다.
    if (state.area) state.location = null;
    renderLocation();
  } else if (dialog.returnValue === 'gps') {
    locate();
  }
});

// ---------- 화면 그리기 ----------
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
}

function scrollDown() {
  requestAnimationFrame(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
}

function addBubble(role, text) {
  const node = el('div', { class: `bubble ${role}` }, text);
  chat.append(node);
  scrollDown();
  return node;
}

function distanceText(m) {
  if (m == null) return '';
  const walk = Math.max(1, Math.round(m / 67)); // 어르신 걸음 약 분당 67m
  const d = m < 1000 ? `${Math.round(m / 10) * 10}m` : `${(m / 1000).toFixed(1)}km`;
  return m <= 2000 ? `${d} · 걸어서 약 ${walk}분` : d;
}

function statusBadge(p, kind) {
  if (kind === 'emergency' && p.emergencyRoom) return el('span', { class: 'badge er' }, '응급실 24시간');
  const s = p.status;
  if (!s.known) return el('span', { class: 'badge closed' }, '시간 확인 필요');
  if (s.open && s.closingSoon) return el('span', { class: 'badge soon' }, `곧 마감 ${s.closesAt}`);
  if (s.open) return el('span', { class: 'badge open' }, kind === 'pharmacy' ? '지금 영업 중' : '지금 진료 중');
  if (s.opensAt) return el('span', { class: 'badge closed' }, `${s.opensAt}에 열어요`);
  return el('span', { class: 'badge closed' }, '오늘 마감');
}

function mapUrl(p) {
  if (p.lat != null && p.lon != null) return `https://map.kakao.com/link/to/${encodeURIComponent(p.name)},${p.lat},${p.lon}`;
  return `https://map.kakao.com/link/search/${encodeURIComponent(`${p.name} ${p.address}`)}`;
}

function placesCard(card) {
  const sub = [`${card.where} 기준`, card.mock ? '예시 데이터' : '국립중앙의료원 정보'].join(' · ');
  const list = card.places.length
    ? card.places.map((p) => el('article', { class: 'place' },
      el('div', { class: 'place-head' },
        el('div', {},
          el('p', { class: 'place-name' }, p.name),
          el('p', { class: 'place-meta' }, [p.category, distanceText(p.distanceM)].filter(Boolean).join(' · ')),
        ),
        statusBadge(p, card.kind),
      ),
      el('p', { class: 'place-meta' }, card.kind === 'emergency' && p.emergencyRoom
        ? '응급실은 밤낮없이 열려 있어요'
        : p.status.dayOff || !p.status.known ? `오늘은 ${p.status.todayText}` : `오늘 ${p.status.todayText}`),
      p.address && el('p', { class: 'place-meta' }, p.address),
      el('div', { class: 'place-actions' },
        p.phone ? el('a', { class: 'btn call', href: `tel:${p.phone.replace(/[^0-9]/g, '')}` }, '전화하기') : el('span'),
        el('a', { class: 'btn map', href: mapUrl(p), target: '_blank', rel: 'noopener' }, '길찾기'),
      ),
    ))
    : [el('p', { class: 'empty' }, card.error || '조건에 맞는 곳을 찾지 못했어요. 문 닫은 곳까지 보려면 "문 닫은 곳도 보여줘"라고 말씀해 보세요.')];
  return el('section', { class: 'card' },
    el('h2', { class: 'card-title' }, card.title),
    el('p', { class: 'card-sub' }, sub),
    list,
    el('p', { class: 'disclaimer' }, '방문 전에 전화로 진료 여부를 꼭 확인하세요.'),
  );
}

function guideText(guide) {
  const lines = [`[${guide.title}]`, guide.summary, ''];
  guide.items.forEach((it) => lines.push(`□ ${it.name}${it.required ? ' (꼭)' : ''}${it.detail ? ` - ${it.detail}` : ''}`));
  if (guide.tips?.length) lines.push('', ...guide.tips.map((t) => `※ ${t}`));
  lines.push('', '- 병원 길잡이에서 보냄');
  return lines.join('\n');
}

async function shareGuide(guide, btn) {
  const text = guideText(guide);
  try {
    if (navigator.share) { await navigator.share({ title: guide.title, text }); return; }
    await navigator.clipboard.writeText(text);
    btn.textContent = '복사했어요. 문자나 카톡에 붙여 넣으세요';
  } catch { /* 사용자가 공유를 취소함 */ }
}

function guideCard(guide) {
  const checked = store.get(`check:${guide.id}`, {});
  const items = guide.items.map((it, i) => el('li', {},
    el('label', {},
      el('input', {
        type: 'checkbox', checked: Boolean(checked[i]),
        onchange: (e) => { checked[i] = e.target.checked; store.set(`check:${guide.id}`, checked); },
      }),
      el('span', {},
        el('span', { class: 'check-name' }, it.name),
        el('span', { class: `tag ${it.required ? 'req' : 'opt'}` }, it.required ? '꼭 챙기기' : '있으면 좋아요'),
        it.detail && el('span', { class: 'check-detail' }, it.detail),
      ),
    ),
  ));
  const shareBtn = el('button', { type: 'button', class: 'btn wide' }, '가족에게 보내기');
  shareBtn.addEventListener('click', () => shareGuide(guide, shareBtn));
  return el('section', { class: 'card' },
    el('h2', { class: 'card-title' }, guide.title),
    el('p', { class: 'card-sub' }, guide.summary),
    el('ul', { class: 'checklist' }, items),
    guide.tips?.length && el('ul', { class: 'tips' }, guide.tips.map((t) => el('li', {}, t))),
    shareBtn,
  );
}

function emergencyCard() {
  return el('section', { class: 'card emergency', role: 'alert' },
    el('h2', { class: 'card-title' }, '위험할 수 있어요. 바로 119에 전화하세요'),
    el('p', { class: 'card-sub' }, '가슴 통증, 숨참, 한쪽 마비, 말이 어눌함은 시간이 중요해요. 직접 운전하지 마세요.'),
    el('a', { class: 'big-call', href: 'tel:119' }, '119 전화하기'),
  );
}

function renderCard(card) {
  if (card.type === 'emergency') return emergencyCard();
  if (card.type === 'places') return placesCard(card);
  if (card.type === 'guide') return guideCard(card.guide);
  return null;
}

// ---------- 질문 보내기 ----------
async function ask(text) {
  text = text.trim();
  if (!text || state.busy) return;
  state.busy = true;
  window.speechSynthesis?.cancel();
  chat.querySelector('.welcome')?.remove();
  addBubble('user', text);
  const wait = addBubble('bot wait', '찾고 있어요');

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, history: state.history, location: state.location, area: state.location ? '' : state.area }),
    });
    const data = await res.json();
    wait.remove();
    if (!res.ok) throw new Error(data.error || '잠시 후 다시 해 주세요.');

    const cards = data.cards || [];
    if (data.emergency && !cards.some((c) => c.type === 'emergency')) cards.unshift({ type: 'emergency' });
    // 응급 안내는 답보다 위에 두고, 그 카드가 먼저 보이게 스크롤한다.
    const alerts = cards.filter((c) => c.type === 'emergency').map(renderCard);
    chat.append(...alerts);
    const bubble = addBubble('bot', data.text);
    bubble.append(el('br'), el('button', { type: 'button', class: 'replay', onclick: () => speak(data.text, true) }, '다시 듣기'));
    chat.append(...cards.filter((c) => c.type !== 'emergency').map(renderCard).filter(Boolean));
    if (alerts.length) requestAnimationFrame(() => alerts[0].scrollIntoView({ behavior: 'smooth', block: 'start' }));
    else scrollDown();
    speak(data.text);

    state.history.push({ role: 'user', text }, { role: 'assistant', text: data.text });
    state.history = state.history.slice(-12);
  } catch (err) {
    wait.remove();
    addBubble('bot', `죄송해요. ${err.message || '연결이 잘 안 돼요.'}`);
  } finally {
    state.busy = false;
  }
}

$('#text-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#text-input');
  ask(input.value);
  input.value = '';
  input.blur();
});

$('#quick').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-ask]');
  if (btn) ask(btn.dataset.ask);
});

// ---------- 음성 인식 ----------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#mic-btn');
const micLabel = $('#mic-label');
const hint = $('#listen-hint');
let recog = null;
let listening = false;

function setListening(on) {
  listening = on;
  micBtn.classList.toggle('listening', on);
  micLabel.textContent = on ? '그만 듣기' : '말하기';
  hint.hidden = !on;
}

if (!Recognition) {
  micBtn.disabled = true;
  micLabel.textContent = '음성 안 됨';
  $('#text-input').placeholder = '자판의 마이크 버튼으로도 말할 수 있어요';
} else {
  micBtn.addEventListener('click', () => {
    if (listening) { recog?.stop(); return; }
    window.speechSynthesis?.cancel();
    recog = new Recognition();
    recog.lang = 'ko-KR';
    recog.interimResults = true;
    recog.continuous = false;
    let finalText = '';
    recog.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      $('#text-input').value = finalText + interim;
    };
    recog.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        addBubble('bot', '마이크 사용이 막혀 있어요. 휴대폰 설정에서 이 앱의 마이크를 허용해 주세요.');
      }
    };
    recog.onend = () => {
      setListening(false);
      const text = finalText.trim() || $('#text-input').value.trim();
      $('#text-input').value = '';
      if (text) ask(text);
    };
    setListening(true);
    recog.start();
  });
}

// ---------- 시작 ----------
async function init() {
  renderLocation();
  locate();
  try {
    const cfg = await (await fetch('/api/config')).json();
    const notes = [];
    if (!cfg.liveData) notes.push('지금은 예시 병원 데이터로 보여 드리는 시험판이에요.');
    if (!cfg.ai) notes.push('AI 안내가 꺼져 있어 기본 안내로 답해요.');
    if (notes.length) { const n = $('#data-notice'); n.textContent = notes.join(' '); n.hidden = false; }
  } catch { /* 설정을 못 받아도 질문은 할 수 있다 */ }
}
init();
