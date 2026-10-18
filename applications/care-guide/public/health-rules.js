// 건강검진 항목과 참고 기준. 화면(브라우저)과 서버가 같이 쓴다.
// 기준은 국가건강검진 판정 기준을 단순화한 것이다. 진단이 아니라 "의사와 상의할 항목"을 고르는 용도.

export const LEVEL_TEXT = { ok: '정상', watch: '주의', check: '확인 필요' };

export const FIELD_GROUPS = [
  { title: '몸 크기', fields: ['height', 'weight', 'bmi', 'waist'] },
  { title: '혈압', fields: ['bp_sys', 'bp_dia'] },
  { title: '당뇨', fields: ['glucose'] },
  { title: '콜레스테롤', fields: ['total_chol', 'ldl', 'hdl', 'tg'] },
  { title: '간', fields: ['ast', 'alt', 'ggt'] },
  { title: '콩팥', fields: ['creatinine', 'egfr'] },
  { title: '빈혈', fields: ['hemoglobin'] },
];

export const FIELDS = {
  height: { label: '키', unit: 'cm' },
  weight: { label: '몸무게', unit: 'kg' },
  bmi: { label: '체질량지수(BMI)', unit: '', about: '키에 비해 몸무게가 알맞은지' },
  waist: { label: '허리둘레', unit: 'cm', about: '배 둘레 비만' },
  bp_sys: { label: '혈압(높은 쪽)', unit: 'mmHg', about: '수축기 혈압' },
  bp_dia: { label: '혈압(낮은 쪽)', unit: 'mmHg', about: '이완기 혈압' },
  glucose: { label: '공복혈당', unit: 'mg/dL', about: '굶은 상태의 피 속 당' },
  total_chol: { label: '총콜레스테롤', unit: 'mg/dL' },
  ldl: { label: '나쁜 콜레스테롤(LDL)', unit: 'mg/dL' },
  hdl: { label: '좋은 콜레스테롤(HDL)', unit: 'mg/dL' },
  tg: { label: '중성지방', unit: 'mg/dL' },
  ast: { label: '간 수치(AST)', unit: 'U/L' },
  alt: { label: '간 수치(ALT)', unit: 'U/L' },
  ggt: { label: '감마지티피(γ-GTP)', unit: 'U/L', about: '술·간 관련 수치' },
  creatinine: { label: '크레아티닌', unit: 'mg/dL', about: '콩팥 기능' },
  egfr: { label: '신사구체여과율(eGFR)', unit: 'mL/min', about: '콩팥이 피를 거르는 힘' },
  hemoglobin: { label: '혈색소', unit: 'g/dL', about: '빈혈 여부' },
};

export const FIELD_KEYS = Object.keys(FIELDS);

// 값이 클수록 나쁜 항목: [주의 시작, 확인 필요 시작]
const HIGH_IS_BAD = {
  glucose: [100, 126],
  total_chol: [200, 240],
  ldl: [130, 160],
  tg: [150, 200],
  ast: [41, 51],
  alt: [36, 46],
  creatinine: [1.6, 1.6],
};

export function levelOf(key, value, sex) {
  if (value == null || !Number.isFinite(value)) return null;
  if (HIGH_IS_BAD[key]) {
    const [watch, check] = HIGH_IS_BAD[key];
    return value >= check ? 'check' : value >= watch ? 'watch' : 'ok';
  }
  switch (key) {
    case 'hdl': return value < 40 ? 'check' : value < 60 ? 'watch' : 'ok';
    case 'egfr': return value < 60 ? 'check' : 'ok';
    case 'bmi': return value >= 25 ? 'check' : value >= 23 || value < 18.5 ? 'watch' : 'ok';
    case 'ggt': {
      if (!sex) return null;
      const [w, c] = sex === 'male' ? [64, 78] : [36, 46];
      return value >= c ? 'check' : value >= w ? 'watch' : 'ok';
    }
    case 'waist': {
      if (!sex) return null;
      return value >= (sex === 'male' ? 90 : 85) ? 'watch' : 'ok';
    }
    case 'hemoglobin': {
      if (!sex) return null;
      const [low, check, high] = sex === 'male' ? [13, 12, 16.6] : [12, 10, 15.6];
      return value < check ? 'check' : value < low || value >= high ? 'watch' : 'ok';
    }
    default: return null;
  }
}

function bloodPressureLevel(sys, dia) {
  if (sys == null && dia == null) return null;
  if ((sys ?? 0) >= 140 || (dia ?? 0) >= 90) return 'check';
  if ((sys ?? 0) >= 120 || (dia ?? 0) >= 80) return 'watch';
  return 'ok';
}

export function computeBmi(v) {
  if (v.bmi != null) return v.bmi;
  if (v.height && v.weight) return Math.round((v.weight / (v.height / 100) ** 2) * 10) / 10;
  return null;
}

// 검진 한 건 → 항목별 판정 목록 (혈압은 두 값을 묶어서 한 줄)
export function evaluate(checkup, sex) {
  const v = { ...(checkup.values || {}) };
  v.bmi = computeBmi(v);
  const rows = [];
  const bp = bloodPressureLevel(v.bp_sys, v.bp_dia);
  if (bp) rows.push({ key: 'bp', label: '혈압', text: `${v.bp_sys ?? '-'}/${v.bp_dia ?? '-'} mmHg`, level: bp });
  for (const key of FIELD_KEYS) {
    if (key === 'bp_sys' || key === 'bp_dia' || key === 'height' || key === 'weight') continue;
    if (v[key] == null) continue;
    const f = FIELDS[key];
    rows.push({ key, label: f.label, text: `${v[key]}${f.unit ? ` ${f.unit}` : ''}`, level: levelOf(key, v[key], sex) });
  }
  return rows;
}

export function flagged(checkup, sex) {
  return evaluate(checkup, sex).filter((r) => r.level === 'watch' || r.level === 'check');
}

export function latestCheckup(health) {
  const list = [...(health?.checkups || [])].sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return list[0] || null;
}

// AI에게 넘길 짧은 요약 (한 단락)
export function summarizeHealth(health) {
  if (!health) return '';
  const parts = [];
  const sexText = health.sex === 'male' ? '남성' : health.sex === 'female' ? '여성' : '';
  const age = health.birthYear ? `${new Date().getFullYear() - health.birthYear}세 무렵` : '';
  if (sexText || age) parts.push([sexText, age].filter(Boolean).join(', '));
  if (health.conditions) parts.push(`앓는 병: ${health.conditions}`);
  if (health.medications) parts.push(`드시는 약: ${health.medications}`);
  if (health.allergies) parts.push(`알레르기: ${health.allergies}`);
  const last = latestCheckup(health);
  if (last) {
    const rows = evaluate(last, health.sex);
    const flags = rows.filter((r) => r.level === 'watch' || r.level === 'check');
    const desc = flags.length
      ? flags.map((r) => `${r.label} ${r.text}(${LEVEL_TEXT[r.level]})`).join(', ')
      : '눈에 띄는 이상 수치 없음';
    parts.push(`최근 건강검진(${last.date || '날짜 모름'}${last.place ? `, ${last.place}` : ''}): ${desc}`);
    if (last.opinion) parts.push(`검진 소견: ${last.opinion}`);
  }
  return parts.join(' / ');
}
