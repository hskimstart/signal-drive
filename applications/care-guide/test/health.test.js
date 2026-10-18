import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, flagged, summarizeHealth, levelOf, computeBmi } from '../public/health-rules.js';
import { sanitizeHealth } from '../server/health.js';
import { basicAnswer } from '../server/assistant.js';

const checkup = { date: '2026-05-10', place: '햇살내과', values: { bp_sys: 145, bp_dia: 88, glucose: 112, ldl: 120, hdl: 38, height: 160, weight: 66, ggt: 40 } };

test('검진 수치 판정', () => {
  const rows = Object.fromEntries(evaluate(checkup, 'female').map((r) => [r.key, r.level]));
  assert.equal(rows.bp, 'check');
  assert.equal(rows.glucose, 'watch');
  assert.equal(rows.ldl, 'ok');
  assert.equal(rows.hdl, 'check');
  assert.equal(rows.bmi, 'check'); // 66 / 1.6^2 = 25.8
  assert.equal(rows.ggt, 'watch'); // 여성 36 이상 주의
  assert.equal(levelOf('ggt', 40, ''), null); // 성별 모르면 판정하지 않음
  assert.equal(computeBmi({ height: 170, weight: 65 }), 22.5);
});

test('AI에게 넘기는 요약', () => {
  const text = summarizeHealth({ sex: 'female', birthYear: 1950, conditions: '고혈압', medications: '혈압약', checkups: [checkup] });
  assert.match(text, /고혈압/);
  assert.match(text, /혈압 145\/88 mmHg\(확인 필요\)/);
  assert.match(text, /2026-05-10/);
});

test('브라우저에서 온 건강수첩 정리', () => {
  const h = sanitizeHealth({ sex: 'x', birthYear: '1948', conditions: 'a'.repeat(500), checkups: [{ date: 'bad', values: { glucose: '1,10', ldl: -3, junk: 5 } }] });
  assert.equal(h.sex, '');
  assert.equal(h.birthYear, 1948);
  assert.equal(h.conditions.length, 200);
  assert.deepEqual(h.checkups[0], { date: '', place: '', opinion: '', values: { glucose: 110 } });
  assert.equal(sanitizeHealth(null), null);
});

test('기본 안내가 건강수첩을 참고', async () => {
  const health = { sex: 'female', medications: '혈압약', checkups: [checkup] };
  const dizzy = await basicAnswer({ message: '자꾸 어지러워요', location: null, area: '', health });
  assert.match(dizzy.text, /신경과/);
  assert.match(dizzy.text, /혈압/);
  assert.match(dizzy.text, /드시는 약/);

  const mine = await basicAnswer({ message: '내 건강검진 결과 어때?', location: null, area: '', health });
  assert.equal(mine.cards[0].type, 'health');
  assert.match(mine.text, /상의해 볼 항목이 \d개/);

  const none = await basicAnswer({ message: '내 건강검진 결과 어때?', location: null, area: '', health: null });
  assert.match(none.text, /등록된 건강검진 결과가 없어요/);
});
