// 질문 하나를 받아 답과 화면 카드를 만든다.
// ANTHROPIC_API_KEY가 있으면 Claude가 답하고, 없거나 실패하면 규칙 기반 기본 안내로 답한다.

import { detectEmergency, suggestDepartments, guideFor } from './knowledge.js';
import { searchPlacesOrClosest } from './egen.js';
import { askClaude, isAIEnabled } from './ai.js';

const EMERGENCY_CARD = { type: 'emergency' };

async function placesCard(kind, opts, title) {
  const result = await searchPlacesOrClosest({ kind, ...opts });
  return { type: 'places', kind, department: opts.department || '', title, ...result };
}

function readableDistance(m) {
  if (m == null) return '';
  return m < 1000 ? `${Math.round(m / 10) * 10}미터` : `${(m / 1000).toFixed(1)}킬로미터`;
}

// 받침 유무에 맞는 조사: josa('치과', '을', '를') → '치과를'
function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return word + (hasFinal ? withFinal : withoutFinal);
}

function describeFirst(card, what) {
  const p = card.places[0];
  const hoursWord = card.kind === 'pharmacy' ? '영업시간' : '진료시간';
  if (card.allClosed) {
    const opens = p.status.opensAt ? ` ${p.name}은 ${p.status.opensAt}에 문을 열어요.` : '';
    return `지금 문을 연 ${josa(what, '은', '는')} 없어요.${opens} 가까운 곳의 ${hoursWord}을 화면에 보여 드릴게요. 급하시면 응급실이나 119를 이용하세요.`;
  }
  if (!p) return `지금 문을 연 ${josa(what, '을', '를')} 찾지 못했어요. 화면의 전화번호로 확인하시거나 119에 상담해 보세요.`;
  const dist = p.distanceM != null ? `${readableDistance(p.distanceM)} 거리의 ` : '';
  return `가장 가까운 곳은 ${dist}${josa(p.name, '이에요', '예요')}. ${p.status.dayOff ? '다만 오늘은 쉬는 날이에요.' : `오늘 ${hoursWord}은 ${p.status.todayText}이에요.`} 나머지는 화면에서 보세요.`;
}

export async function basicAnswer({ message, location, area }) {
  const openNow = !/(문\s*닫은|닫은\s*곳|전부|다\s*보여)/.test(message);
  const opts = { location, area };
  if (detectEmergency(message)) {
    const card = await placesCard('emergency', { ...opts, openNow: true }, '가까운 응급실');
    return { text: '말씀하신 증상은 위험할 수 있어요. 지금 바로 119에 전화하세요. 가까운 응급실도 화면에 보여 드릴게요.', cards: [EMERGENCY_CARD, card] };
  }

  const guide = guideFor(message);
  if (guide) return { text: `${guide.summary} 챙기실 서류를 화면에 정리해 드렸어요.`, cards: [{ type: 'guide', guide }] };

  if (/약국|약\s*사|약을\s*사/.test(message)) {
    const card = await placesCard('pharmacy', { ...opts, openNow }, '가까운 약국');
    return { text: describeFirst(card, '약국'), cards: [card] };
  }

  if (/응급실/.test(message)) {
    const card = await placesCard('emergency', { ...opts, openNow: true }, '가까운 응급실');
    return { text: describeFirst(card, '응급실'), cards: [card] };
  }

  const depts = suggestDepartments(message);
  if (depts.length) {
    const department = depts[0];
    const card = await placesCard('hospital', { ...opts, department, openNow }, `${department} · 가까운 병원`);
    const also = depts.length > 1 ? ` ${depts.slice(1).join(', ')}도 볼 수 있어요.` : '';
    return { text: `말씀하신 증상은 보통 ${department}에서 진료해요.${also} ${describeFirst(card, department)}`, cards: [card] };
  }

  if (/병원|의원|진료/.test(message)) {
    const card = await placesCard('hospital', { ...opts, openNow }, openNow ? '지금 문 연 병원' : '가까운 병원');
    return { text: describeFirst(card, '병원'), cards: [card] };
  }

  return {
    text: '어디가 불편하신지 말씀해 주세요. 예를 들어 "무릎이 아파요", "문 연 약국 알려줘", "보험 청구 서류가 뭐야" 하고 말씀하시면 돼요.',
    cards: [],
  };
}

export async function answer({ message, history = [], location = null, area = '' }) {
  const emergency = detectEmergency(message);

  if (isAIEnabled()) {
    try {
      const fullMessage = area ? `${message}\n(사는 동네: ${area})` : message;
      const res = await askClaude({ message: fullMessage, history, location });
      const cards = emergency && !res.cards.some((c) => c.type === 'emergency') ? [EMERGENCY_CARD, ...res.cards] : res.cards;
      return { mode: 'ai', emergency, ...res, cards };
    } catch (err) {
      console.error('[ai] 실패, 기본 안내로 전환:', err.message);
    }
  }
  return { mode: 'basic', emergency, ...(await basicAnswer({ message, location, area })) };
}
