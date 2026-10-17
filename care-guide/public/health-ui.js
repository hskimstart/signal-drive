// 내 건강수첩: 평소 건강 정보와 건강검진 결과를 이 휴대폰에만 저장하고, 질문할 때 참고하게 한다.

import { el, store } from './dom.js';
import { FIELDS, FIELD_GROUPS, LEVEL_TEXT, evaluate, flagged, latestCheckup } from './health-rules.js';

const KEY = 'health';
const dialog = document.getElementById('health-dialog');
const photoInput = document.getElementById('photo-input');
let photoExtract = false;

const emptyHealth = () => ({ sex: '', birthYear: '', conditions: '', medications: '', allergies: '', shareWithAI: true, checkups: [] });

function load() {
  return { ...emptyHealth(), ...store.get(KEY, {}) };
}

function save(health) {
  if (!store.set(KEY, health)) alert('이 휴대폰에 저장하지 못했어요. 브라우저의 개인정보 보호 모드를 꺼 주세요.');
}

const sortedCheckups = (h) => [...h.checkups].sort((a, b) => String(b.date).localeCompare(String(a.date)));
const hasAnything = (h) => h.checkups.length || h.conditions || h.medications || h.allergies;

export function initHealth(opts = {}) {
  photoExtract = Boolean(opts.photoExtract);
}

// 질문과 함께 서버로 보낼 건강수첩 (사용자가 끄면 보내지 않음)
export function getHealthForChat() {
  const h = load();
  if (!h.shareWithAI || !hasAnything(h)) return null;
  return { ...h, checkups: sortedCheckups(h).slice(0, 3) };
}

// ---------- 공통 조각 ----------
function levelBadge(level) {
  if (!level) return el('span', { class: 'badge closed' }, '참고');
  const cls = { ok: 'open', watch: 'soon', check: 'er' }[level];
  return el('span', { class: `badge ${cls}` }, LEVEL_TEXT[level]);
}

function resultRows(checkup, sex) {
  const rows = evaluate(checkup, sex);
  if (!rows.length) return el('p', { class: 'empty' }, '입력된 수치가 없어요.');
  return el('ul', { class: 'result-rows' }, rows.map((r) => el('li', {},
    el('span', { class: 'result-label' }, r.label),
    el('span', { class: 'result-value' }, r.text),
    levelBadge(r.level),
  )));
}

function dateText(d) {
  if (!d) return '날짜 모름';
  return `${d.slice(0, 4)}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8))}일`;
}

function closeBtn() {
  return el('button', { type: 'button', class: 'sheet-close', onclick: () => dialog.close() }, '닫기');
}

function show(...children) {
  dialog.replaceChildren(el('div', { class: 'sheet-body' }, ...children));
  if (!dialog.open && typeof dialog.showModal === 'function') dialog.showModal();
  dialog.scrollTop = 0;
  dialog.querySelector('.sheet-body').scrollTop = 0;
}

// ---------- 대화 속 카드 ----------
export function healthCard() {
  const h = load();
  const last = latestCheckup(h);
  if (!last) {
    return el('section', { class: 'card' },
      el('h2', { class: 'card-title' }, '내 건강수첩'),
      el('p', { class: 'card-sub' }, '건강검진 결과를 넣어 두시면 병원을 안내할 때 함께 참고해요.'),
      el('button', { type: 'button', class: 'btn wide', onclick: () => openHealthPanel() }, '검진 결과 등록하기'),
    );
  }
  const flags = flagged(last, h.sex);
  return el('section', { class: 'card' },
    el('h2', { class: 'card-title' }, '최근 건강검진'),
    el('p', { class: 'card-sub' }, [dateText(last.date), last.place].filter(Boolean).join(' · ')),
    flags.length
      ? el('ul', { class: 'result-rows' }, flags.map((r) => el('li', {},
        el('span', { class: 'result-label' }, r.label), el('span', { class: 'result-value' }, r.text), levelBadge(r.level))))
      : el('p', { class: 'empty' }, '눈에 띄게 높거나 낮은 수치는 없었어요.'),
    el('div', { class: 'place-actions' },
      el('button', { type: 'button', class: 'btn map', onclick: () => openHealthPanel() }, '건강수첩 열기'),
      el('button', { type: 'button', class: 'btn call', onclick: () => openDoctorView() }, '의사 선생님께 보여 드리기'),
    ),
  );
}

// ---------- 건강수첩 첫 화면 ----------
export function openHealthPanel() {
  const h = load();

  const checkupList = sortedCheckups(h).map((c) => {
    const flags = flagged(c, h.sex);
    return el('article', { class: 'checkup' },
      el('div', { class: 'place-head' },
        el('div', {},
          el('p', { class: 'place-name' }, dateText(c.date)),
          c.place && el('p', { class: 'place-meta' }, c.place),
        ),
        flags.length ? el('span', { class: 'badge soon' }, `상의할 항목 ${flags.length}개`) : el('span', { class: 'badge open' }, '이상 수치 없음'),
      ),
      resultRows(c, h.sex),
      c.opinion && el('p', { class: 'opinion' }, `소견: ${c.opinion}`),
      el('div', { class: 'place-actions' },
        el('button', { type: 'button', class: 'btn map', onclick: () => openCheckupForm(c) }, '고치기'),
        el('button', {
          type: 'button', class: 'btn danger-soft',
          onclick: () => {
            if (!confirm(`${dateText(c.date)} 검진 기록을 지울까요?`)) return;
            const next = load();
            next.checkups = next.checkups.filter((x) => x.id !== c.id);
            save(next);
            openHealthPanel();
          },
        }, '지우기'),
      ),
    );
  });

  const field = (key, label, attrs = {}, multiline = false) => {
    const input = el(multiline ? 'textarea' : 'input', {
      id: `h-${key}`, value: h[key] ?? '', rows: multiline ? 2 : null, ...attrs,
      onchange: (e) => { const next = load(); next[key] = e.target.value.trim(); save(next); },
    });
    return el('label', { class: 'field' }, el('span', { class: 'field-label' }, label), input);
  };

  const sexRadio = (value, label) => el('label', { class: 'radio' },
    el('input', {
      type: 'radio', name: 'h-sex', value, checked: h.sex === value,
      onchange: () => { const next = load(); next.sex = value; save(next); },
    }), label);

  show(
    el('div', { class: 'sheet-head' }, el('h2', { class: 'sheet-title' }, '내 건강수첩'), closeBtn()),
    el('p', { class: 'privacy' }, '여기 적은 내용은 이 휴대폰에만 저장돼요. 휴대폰을 바꾸거나 인터넷 기록을 지우면 사라질 수 있어요.'),

    el('section', { class: 'sheet-section' },
      el('h3', { class: 'section-title' }, '건강검진 결과'),
      el('div', { class: 'add-buttons' },
        photoExtract && el('button', { type: 'button', class: 'btn wide', onclick: () => photoInput.click() }, '결과지 사진 찍어서 넣기'),
        el('button', { type: 'button', class: `btn wide ${photoExtract ? 'secondary' : ''}`, onclick: () => openCheckupForm(null) }, '직접 입력하기'),
      ),
      checkupList.length ? checkupList : el('p', { class: 'empty' }, '아직 등록한 검진 결과가 없어요. 국민건강보험공단 검진 결과 통보서를 보고 넣으시면 돼요.'),
    ),

    el('section', { class: 'sheet-section' },
      el('h3', { class: 'section-title' }, '평소 건강 정보'),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, '성별'), el('div', { class: 'radios' }, sexRadio('male', '남자'), sexRadio('female', '여자'))),
      field('birthYear', '태어난 해', { type: 'number', inputmode: 'numeric', placeholder: '예) 1950' }),
      field('conditions', '앓고 있는 병', { placeholder: '예) 고혈압, 당뇨' }, true),
      field('medications', '드시는 약', { placeholder: '예) 혈압약 아침 1알' }, true),
      field('allergies', '알레르기', { placeholder: '예) 페니실린, 땅콩' }),
    ),

    el('section', { class: 'sheet-section' },
      el('label', { class: 'consent' },
        el('input', {
          type: 'checkbox', checked: h.shareWithAI,
          onchange: (e) => { const next = load(); next.shareWithAI = e.target.checked; save(next); },
        }),
        el('span', {}, '질문할 때 건강수첩을 참고하게 하기', el('small', {}, '켜 두면 질문과 함께 이 내용이 안내 서버와 AI에 전달돼요. 저장되지는 않아요.')),
      ),
    ),

    el('button', { type: 'button', class: 'btn wide doctor', onclick: () => openDoctorView() }, '의사 선생님께 보여 드리기'),
    el('button', {
      type: 'button', class: 'link-btn danger-link',
      onclick: () => {
        if (!confirm('건강수첩의 모든 내용을 지울까요? 되돌릴 수 없어요.')) return;
        store.remove(KEY);
        openHealthPanel();
      },
    }, '건강수첩 모두 지우기'),
  );
}

// ---------- 검진 입력/고치기 ----------
function openCheckupForm(existing, { fromPhoto = false } = {}) {
  const c = existing || { id: null, date: '', place: '', opinion: '', values: {} };
  const numInput = (key) => {
    const f = FIELDS[key];
    return el('label', { class: 'field num' },
      el('span', { class: 'field-label' }, f.label, f.about && el('small', {}, f.about)),
      el('span', { class: 'num-wrap' },
        el('input', { name: key, type: 'text', inputmode: 'decimal', autocomplete: 'off', value: c.values?.[key] ?? '' }),
        f.unit && el('span', { class: 'unit' }, f.unit),
      ),
    );
  };

  const form = el('form', { class: 'checkup-form' },
    fromPhoto && el('p', { class: 'photo-note' }, c.readable === false
      ? '사진에서 결과지를 알아보지 못했어요. 직접 입력해 주시거나 더 밝은 곳에서 다시 찍어 주세요.'
      : '사진에서 읽은 값이에요. 결과지와 하나씩 맞는지 꼭 확인하고 저장해 주세요.'),
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, '검진 날짜'), el('input', { name: 'date', type: 'date', value: c.date })),
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, '검진 받은 곳'), el('input', { name: 'place', type: 'text', value: c.place, placeholder: '예) ○○내과의원' })),
    FIELD_GROUPS.map((g) => el('fieldset', { class: 'group' }, el('legend', {}, g.title), g.fields.map(numInput))),
    el('label', { class: 'field' }, el('span', { class: 'field-label' }, '종합 소견'), el('textarea', { name: 'opinion', rows: 3, value: c.opinion, placeholder: '결과지의 의사 소견이나 판정' })),
    el('p', { class: 'privacy' }, '모르는 칸은 비워 두셔도 돼요.'),
    el('div', { class: 'place-actions sticky-actions' },
      el('button', { type: 'button', class: 'btn map', onclick: () => openHealthPanel() }, '취소'),
      el('button', { type: 'submit', class: 'btn call' }, '저장'),
    ),
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const values = {};
    for (const key of Object.keys(FIELDS)) {
      const raw = String(data.get(key) || '').replace(/,/g, '').trim();
      const n = Number(raw);
      if (raw && Number.isFinite(n) && n > 0) values[key] = n;
    }
    const record = {
      id: c.id || Date.now().toString(36),
      date: String(data.get('date') || ''),
      place: String(data.get('place') || '').trim(),
      opinion: String(data.get('opinion') || '').trim(),
      values,
    };
    const next = load();
    next.checkups = [...next.checkups.filter((x) => x.id !== record.id), record];
    save(next);
    openHealthPanel();
  });

  show(
    el('div', { class: 'sheet-head' }, el('h2', { class: 'sheet-title' }, existing?.id ? '검진 결과 고치기' : '검진 결과 넣기'), closeBtn()),
    form,
  );
}

// ---------- 결과지 사진 ----------
async function shrinkImage(file, maxSide = 1600) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(img.src);
  return canvas.toDataURL('image/jpeg', 0.85);
}

photoInput?.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  photoInput.value = '';
  if (!file) return;
  show(
    el('div', { class: 'sheet-head' }, el('h2', { class: 'sheet-title' }, '결과지 읽는 중'), closeBtn()),
    el('p', { class: 'bubble bot wait' }, '사진을 읽고 있어요. 20초쯤 걸려요'),
  );
  try {
    const image = await shrinkImage(file);
    const res = await fetch('/api/checkup/extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    openCheckupForm({ ...data, id: null }, { fromPhoto: true });
  } catch (err) {
    show(
      el('div', { class: 'sheet-head' }, el('h2', { class: 'sheet-title' }, '사진을 읽지 못했어요'), closeBtn()),
      el('p', {}, err.message || '잠시 후 다시 해 주세요.'),
      el('button', { type: 'button', class: 'btn wide', onclick: () => openCheckupForm(null) }, '직접 입력하기'),
    );
  }
});

// ---------- 의사 선생님께 보여 드리기 ----------
function openDoctorView() {
  const h = load();
  const last = latestCheckup(h);
  const age = h.birthYear ? `${new Date().getFullYear() - Number(h.birthYear)}세` : '';
  const sex = h.sex === 'male' ? '남' : h.sex === 'female' ? '여' : '';
  const line = (label, value) => value && el('div', { class: 'doc-line' }, el('span', { class: 'doc-label' }, label), el('span', {}, value));
  show(
    el('div', { class: 'sheet-head' }, el('h2', { class: 'sheet-title' }, '진료 참고용 건강 정보'), closeBtn()),
    el('div', { class: 'doctor-view' },
      line('성별·나이', [sex, age].filter(Boolean).join(' · ')),
      line('앓는 병', h.conditions),
      line('드시는 약', h.medications),
      line('알레르기', h.allergies),
      last
        ? el('div', {},
          el('h3', { class: 'section-title' }, `최근 건강검진 — ${dateText(last.date)}${last.place ? ` · ${last.place}` : ''}`),
          resultRows(last, h.sex),
          last.opinion && el('p', { class: 'opinion' }, `소견: ${last.opinion}`))
        : el('p', { class: 'empty' }, '등록된 건강검진 결과가 없어요.'),
      el('p', { class: 'privacy' }, '본인이 입력한 정보예요. 표시(주의·확인 필요)는 국가건강검진 기준을 단순화한 참고용이에요.'),
    ),
    el('button', { type: 'button', class: 'btn wide', onclick: () => openHealthPanel() }, '건강수첩으로 돌아가기'),
  );
}
