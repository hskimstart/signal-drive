// Claude 연동. 어르신의 말(음성→글자)을 이해해 진료과를 추천하고,
// 도구(search_places, get_document_guide)로 실제 병원·약국·서류 정보를 찾아 쉬운 말로 답한다.

import Anthropic from '@anthropic-ai/sdk';
import { DEPARTMENT_NAMES, GUIDES } from './knowledge.js';
import { searchPlacesOrClosest } from './egen.js';
import { kstNow } from './hours.js';

const MODEL = process.env.CARE_AI_MODEL || 'claude-opus-5-5';
// 대화형 안내라 응답 속도를 우선해 low로 둔다. 답이 부족하면 medium으로 올려 보세요.
const EFFORT = process.env.CARE_AI_EFFORT || 'low';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOOL_ROUNDS = 4;

export const isAIEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

let client;
const getClient = () => (client ??= new Anthropic());

const SYSTEM = `당신은 "병원 길잡이"라는 앱의 안내원입니다. 주로 70~80대 어르신이 휴대폰에 말로 물어보십니다.

할 일
- 증상을 들으면 어느 진료과에 가면 좋을지 알려 드리고, search_places 도구로 지금 문 연 가까운 병원을 찾아 드립니다.
- 약국, 응급실, 큰 병원(상급종합병원) 갈 때 챙길 서류, 보험금 청구 서류를 안내합니다. 서류는 get_document_guide 도구의 내용을 바탕으로 말합니다.
- 위치 정보가 없고 동네 이름도 모르면, 사시는 동네(예: "서울 종로구")를 여쭤봅니다.

말하는 방법
- 답은 소리로 읽어 드립니다. 별표, 샵, 표, 목록 기호 같은 마크다운을 쓰지 말고, 짧은 문장 3~5개로 말하세요.
- 공손한 존댓말, 쉬운 우리말을 씁니다. 어려운 의학 용어는 풀어서 말합니다.
- 병원 이름, 거리, 오늘 진료시간처럼 꼭 필요한 것만 말하고, 자세한 목록은 화면 카드에 나온다고 알려 드립니다.
- 찾은 결과가 없으면 솔직히 말하고 다른 방법(전화 확인, 119 상담, 다른 진료과)을 알려 드립니다.

안전
- 당신은 의사가 아닙니다. 병명을 단정하거나 약 용량을 정해 드리지 않습니다.
- 가슴 통증, 숨이 참, 한쪽 마비, 말이 어눌함, 의식 저하, 심한 출혈 같은 위험 신호가 있으면 다른 말보다 먼저 "바로 119에 전화하세요"라고 말하고 응급실을 찾아 드립니다.
- 병원 정보는 공공데이터라 실제와 다를 수 있으니, 가시기 전에 전화로 확인하시라고 한 번 덧붙입니다.`;

const TOOLS = [
  {
    name: 'search_places',
    description: '사용자 주변의 병원, 약국, 응급실을 국립중앙의료원 공공데이터에서 찾는다. 결과는 화면에 카드로도 표시된다.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['hospital', 'pharmacy', 'emergency'], description: 'hospital=병·의원, pharmacy=약국, emergency=응급실' },
        department: { type: 'string', enum: ['상관없음', ...DEPARTMENT_NAMES], description: '병원을 찾을 때 진료과. 모르면 상관없음' },
        open_now: { type: 'boolean', description: '지금 진료/영업 중인 곳만 찾을지' },
        area: { type: 'string', description: '사용자가 말한 동네(예: "서울 종로구"). 말하지 않았으면 빈 문자열' },
      },
      required: ['kind', 'department', 'open_now', 'area'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_document_guide',
    description: '병원·보험 관련 준비 서류 안내를 가져온다. 결과는 화면에 체크리스트로도 표시된다.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          enum: Object.keys(GUIDES),
          description: 'tertiary_hospital=큰 병원 첫 진료, insurance_outpatient=실손 통원, insurance_inpatient=실손 입원·수술, insurance_diagnosis=진단비·수술비 보험, proxy=가족이 대신 서류 발급',
        },
      },
      required: ['topic'],
      additionalProperties: false,
    },
  },
];

const PLACE_TITLES = { hospital: '가까운 병원', pharmacy: '가까운 약국', emergency: '가까운 응급실' };

async function runTool(name, input, ctx) {
  if (name === 'search_places') {
    if (!ctx.location && !input.area) {
      return { error: '위치를 모릅니다. 사시는 동네 이름을 여쭤보세요.' };
    }
    const department = input.department === '상관없음' ? '' : input.department;
    const result = await searchPlacesOrClosest({ kind: input.kind, location: ctx.location, area: input.area, department, openNow: input.open_now });
    ctx.cards.push({
      type: 'places', kind: input.kind, department,
      title: `${department ? `${department} · ` : ''}${PLACE_TITLES[input.kind]}`,
      ...result,
    });
    return {
      기준위치: result.where,
      예시데이터: result.mock,
      지금문연곳없음: result.allClosed || undefined,
      결과: result.places.slice(0, 5).map((p) => ({
        이름: p.name, 종류: p.category, 거리m: p.distanceM,
        지금진료중: p.status.open, 오늘진료시간: p.status.todayText, 전화: p.phone,
      })),
    };
  }
  if (name === 'get_document_guide') {
    const guide = GUIDES[input.topic];
    if (!guide) return { error: '없는 안내입니다.' };
    ctx.cards.push({ type: 'guide', guide });
    return guide;
  }
  return { error: `알 수 없는 도구: ${name}` };
}

function toMessages(history, message, ctx) {
  const msgs = [];
  for (const h of history.slice(-10)) {
    if ((h.role === 'user' || h.role === 'assistant') && typeof h.text === 'string' && h.text.trim()) {
      msgs.push({ role: h.role, content: h.text.slice(0, 2000) });
    }
  }
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  const now = kstNow();
  const hh = String(Math.floor(now.minutes / 60)).padStart(2, '0');
  const mm = String(now.minutes % 60).padStart(2, '0');
  const days = ['', '월', '화', '수', '목', '금', '토', '일'];
  const note = `[앱 참고정보 — 지금 ${now.ymd}(${days[now.weekday]}${now.dayIndex === 8 ? ', 공휴일' : ''}) ${hh}:${mm}, 위치 정보 ${ctx.location ? '있음' : '없음'}]`;
  msgs.push({ role: 'user', content: `${message}\n\n${note}` });
  return msgs;
}

export async function askClaude({ message, history = [], location = null }) {
  const ctx = { location, cards: [] };
  const messages = toMessages(history, message, ctx);

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: EFFORT },
      cache_control: { type: 'ephemeral' },
      system: SYSTEM,
      tools: TOOLS,
      messages,
    });

    if (response.stop_reason === 'refusal') {
      return { text: '죄송해요, 그 질문에는 답을 드리기 어려워요. 급하시면 119나 가까운 병원에 전화해 보세요.', cards: ctx.cards };
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter((b) => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || !toolUses.length) {
      const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      return { text: text || '다시 한 번 말씀해 주시겠어요?', cards: ctx.cards };
    }

    const results = await Promise.all(toolUses.map(async (t) => {
      try {
        return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(await runTool(t.name, t.input, ctx)) };
      } catch (err) {
        return { type: 'tool_result', tool_use_id: t.id, content: `조회 실패: ${err.message}`, is_error: true };
      }
    }));
    messages.push({ role: 'user', content: results });
  }

  return { text: '찾아본 내용을 화면에 보여 드릴게요.', cards: ctx.cards };
}
