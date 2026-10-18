import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStatus } from '../server/hours.js';
import { detectEmergency, suggestDepartments, guideFor, parseArea } from '../server/knowledge.js';
import { parseItems, searchPlaces } from '../server/egen.js';
import { basicAnswer } from '../server/assistant.js';

// 2026-10-14(수) 10:30 KST = 01:30 UTC
const WED_1030 = new Date('2026-10-14T01:30:00Z');
const WED_2330 = new Date('2026-10-14T14:30:00Z');
const THU_0100 = new Date('2026-10-14T16:00:00Z');
const HANGUL_DAY = new Date('2026-10-09T03:00:00Z'); // 한글날(공휴일) 12:00

test('진료시간: 평일 진료 중', () => {
  const s = openStatus({ dutyTime3s: '0900', dutyTime3c: '1830' }, WED_1030);
  assert.equal(s.open, true);
  assert.equal(s.todayText, '09:00 ~ 18:30');
});

test('진료시간: 마감 후, 밤샘 영업, 공휴일', () => {
  assert.equal(openStatus({ dutyTime3s: '0900', dutyTime3c: '1830' }, WED_2330).open, false);
  const night = { dutyTime3s: '1800', dutyTime3c: '0200', dutyTime4s: '1800', dutyTime4c: '0200' };
  assert.equal(openStatus(night, WED_2330).open, true);
  assert.equal(openStatus(night, THU_0100).open, true); // 수요일 밤에 시작한 영업이 이어짐
  assert.equal(openStatus({ dutyTime5s: '0900', dutyTime5c: '1800' }, HANGUL_DAY).open, false);
  assert.equal(openStatus({ dutyTime8s: '0900', dutyTime8c: '1800' }, HANGUL_DAY).open, true);
  assert.equal(openStatus({}, WED_1030).known, false);
});

test('응급 신호 감지', () => {
  assert.ok(detectEmergency('갑자기 가슴이 너무 답답하고 아파요'));
  assert.ok(detectEmergency('엄마가 한쪽 팔에 힘이 없고 말이 어눌해요'));
  assert.ok(!detectEmergency('무릎이 시큰거려요'));
});

test('증상 → 진료과', () => {
  assert.equal(suggestDepartments('무릎이 아파서 걷기가 힘들어')[0], '정형외과');
  assert.equal(suggestDepartments('눈이 침침해요')[0], '안과');
  assert.equal(suggestDepartments('기침이 나고 열이 나요')[0], '내과');
  assert.equal(suggestDepartments('잇몸이 부었어')[0], '치과');
});

test('서류 안내 고르기', () => {
  assert.equal(guideFor('대학병원 갈 때 뭐 챙겨?').id, 'tertiary_hospital');
  assert.equal(guideFor('실비 청구하려면 뭐가 필요해').id, 'insurance_outpatient');
  assert.equal(guideFor('입원했는데 보험 청구 서류').id, 'insurance_inpatient');
  assert.equal(guideFor('안녕하세요'), null);
});

test('동네 이름 나누기', () => {
  assert.deepEqual(parseArea('서울 종로구'), { sido: '서울특별시', sigungu: '종로구' });
  assert.deepEqual(parseArea('경기도 성남시 분당구 정자동'), { sido: '경기도', sigungu: '성남시 분당구' });
  assert.equal(parseArea(''), null);
});

test('E-GEN XML 응답 읽기', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><hpid>A1</hpid><dutyName>테스트의원</dutyName><dutyTime1s>0900</dutyTime1s></item></items><numOfRows>10</numOfRows></body></response>`;
  const items = parseItems(xml);
  assert.equal(items.length, 1);
  assert.equal(items[0].dutyTime1s, '0900'); // 앞자리 0이 사라지면 안 됨
  assert.deepEqual(parseItems('<response><header><resultCode>00</resultCode></header><body><items></items></body></response>'), []);
  assert.throws(() => parseItems('<OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>'));
});

test('예시 데이터 검색: 진료과·응급실 필터와 거리순', async () => {
  const loc = { lat: 37.5, lon: 127.0 };
  const ortho = await searchPlaces({ kind: 'hospital', location: loc, department: '정형외과', openNow: false });
  assert.ok(ortho.mock);
  assert.ok(ortho.places.length > 0);
  assert.ok(ortho.places.every((p) => p.departments.includes('정형외과')));
  const ds = ortho.places.map((p) => p.distanceM);
  assert.deepEqual(ds, [...ds].sort((a, b) => a - b));
  const er = await searchPlaces({ kind: 'emergency', location: loc, openNow: true });
  assert.ok(er.places.length > 0 && er.places.every((p) => p.emergencyRoom));
});

test('기본 안내: 응급이면 119 카드가 먼저', async () => {
  const res = await basicAnswer({ message: '가슴이 조이듯 아파요', location: null, area: '' });
  assert.equal(res.cards[0].type, 'emergency');
  assert.match(res.text, /119/);
});
