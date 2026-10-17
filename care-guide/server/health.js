// 건강수첩: 휴대폰에 저장된 정보를 질문 때 받아 정리하고, 검진 결과지 사진에서 수치를 읽는다.
// 서버는 건강정보를 저장하지 않는다. 받은 요청을 처리하고 버린다.

import Anthropic from '@anthropic-ai/sdk';
import { FIELD_KEYS, FIELDS } from '../public/health-rules.js';

const MODEL = process.env.CARE_AI_MODEL || 'claude-opus-5-5';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const text = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 && n < 10000 ? n : null;
};

// 브라우저가 보낸 건강수첩을 믿지 않고 필요한 모양으로만 다시 만든다.
export function sanitizeHealth(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const checkups = (Array.isArray(raw.checkups) ? raw.checkups : [])
    .slice(0, 20)
    .map((c) => ({
      date: /^\d{4}-\d{2}-\d{2}$/.test(c?.date) ? c.date : '',
      place: text(c?.place, 60),
      opinion: text(c?.opinion, 300),
      values: Object.fromEntries(FIELD_KEYS.map((k) => [k, num(c?.values?.[k])]).filter(([, v]) => v != null)),
    }));
  const birthYear = Number(raw.birthYear);
  return {
    sex: raw.sex === 'male' || raw.sex === 'female' ? raw.sex : '',
    birthYear: birthYear > 1900 && birthYear < 2030 ? birthYear : null,
    conditions: text(raw.conditions),
    medications: text(raw.medications),
    allergies: text(raw.allergies),
    checkups,
  };
}

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] };

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean', description: '건강검진 결과지로 읽을 수 있는 사진인지' },
    date: { type: 'string', description: '검진 날짜 YYYY-MM-DD. 모르면 빈 문자열' },
    place: { type: 'string', description: '검진 기관 이름. 모르면 빈 문자열' },
    opinion: { type: 'string', description: '종합 판정이나 의사 소견 원문 요약(100자 이내). 없으면 빈 문자열' },
    values: {
      type: 'object',
      properties: Object.fromEntries(FIELD_KEYS.map((k) => [k, { ...nullableNumber, description: `${FIELDS[k].label}${FIELDS[k].unit ? ` (${FIELDS[k].unit})` : ''}` }])),
      required: FIELD_KEYS,
      additionalProperties: false,
    },
  },
  required: ['readable', 'date', 'place', 'opinion', 'values'],
  additionalProperties: false,
};

const EXTRACT_PROMPT = `이 사진은 한국 건강검진 결과지입니다. 적혀 있는 값을 그대로 옮겨 주세요.
- 사진에 분명히 보이는 숫자만 적고, 안 보이거나 흐리거나 없는 항목은 null로 둡니다. 추측하지 마세요.
- 단위가 괄호 안 단위와 다르면 바꾸지 말고 null로 둡니다.
- 혈압이 "130/85"처럼 적혀 있으면 앞은 bp_sys, 뒤는 bp_dia입니다.
- 결과지가 아니거나 읽을 수 없으면 readable을 false로 합니다.`;

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

export async function extractCheckup(dataUrl) {
  const m = DATA_URL.exec(dataUrl || '');
  if (!m) throw Object.assign(new Error('사진 형식이 맞지 않아요.'), { status: 400 });

  const response = await new Anthropic().beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: EXTRACT_SCHEMA } },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
        { type: 'text', text: EXTRACT_PROMPT },
      ],
    }],
  });

  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    throw new Error('사진을 읽지 못했어요. 직접 입력해 주세요.');
  }
  const body = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(body);
  const clean = sanitizeHealth({ checkups: [parsed] }).checkups[0];
  return { readable: Boolean(parsed.readable), ...clean };
}
