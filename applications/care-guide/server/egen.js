// 국립중앙의료원(E-GEN) 공공데이터 API 연동.
//  - 전국 병·의원 찾기 서비스:  B552657/HsptlAsembySearchService
//  - 전국 약국 정보 조회 서비스: B552657/ErmctInsttInfoInqireService
// 공공데이터포털(data.go.kr)에서 두 API를 활용신청한 뒤 "일반 인증키(Decoding)"를 EGEN_SERVICE_KEY에 넣는다.
// 키가 없으면 예시 데이터(mock)로 동작한다.

import { XMLParser } from 'fast-xml-parser';
import { DEPARTMENTS, parseArea } from './knowledge.js';
import { openStatus, kstNow } from './hours.js';
import { mockPlaces } from './mock-data.js';

const BASE = process.env.EGEN_BASE_URL || 'https://apis.data.go.kr/B552657';
const SERVICES = {
  hospital: {
    path: 'HsptlAsembySearchService',
    list: 'getHsptlMdcncListInfoInqire',
    nearby: 'getHsptlMdcncLcinfoInqire',
    detail: 'getHsptlBassInfoInqire',
  },
  pharmacy: {
    path: 'ErmctInsttInfoInqireService',
    list: 'getParmacyListInfoInqire',
    nearby: 'getParmacyLcinfoInqire',
    detail: 'getParmacyBassInfoInqire',
  },
};

// 2023~2024년에 이름이 바뀐 시도. 데이터에 옛 이름이 남아 있을 수 있어 둘 다 시도한다.
const SIDO_ALIASES = { 강원특별자치도: '강원도', 전북특별자치도: '전라북도' };

export const isLive = () => Boolean(process.env.EGEN_SERVICE_KEY);

const parser = new XMLParser({ parseTagValue: false, ignoreAttributes: true, trimValues: true });
const cache = new Map();

async function call(kind, op, params, ttlMs) {
  const svc = SERVICES[kind];
  const qs = new URLSearchParams({ serviceKey: process.env.EGEN_SERVICE_KEY, ...params });
  const url = `${BASE}/${svc.path}/${svc[op]}?${qs}`;

  const hit = cache.get(url);
  if (hit && hit.expires > Date.now()) return hit.items;

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`E-GEN HTTP ${res.status}`);
  const items = parseItems(await res.text());
  cache.set(url, { items, expires: Date.now() + ttlMs });
  return items;
}

export function parseItems(body) {
  const doc = body.trim().startsWith('{') ? JSON.parse(body) : parser.parse(body);
  if (doc.OpenAPI_ServiceResponse) {
    const h = doc.OpenAPI_ServiceResponse.cmmMsgHeader || {};
    throw new Error(`E-GEN 인증/호출 오류: ${h.returnAuthMsg || h.errMsg || '알 수 없음'}`);
  }
  const header = doc.response?.header || {};
  if (header.resultCode && String(header.resultCode) !== '00') {
    throw new Error(`E-GEN 오류 ${header.resultCode}: ${header.resultMsg || ''}`);
  }
  const raw = doc.response?.body?.items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function distanceM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// API 응답 한 건을 앱에서 쓰는 모양으로 바꾼다.
export function normalize(item, kind, origin, now = new Date()) {
  const lat = Number(item.wgs84Lat ?? item.latitude);
  const lon = Number(item.wgs84Lon ?? item.longitude);
  const hasPos = Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0;
  const departments = item.dgidIdName ? String(item.dgidIdName).split(',').map((s) => s.trim()).filter(Boolean) : [];
  return {
    id: item.hpid,
    kind,
    name: item.dutyName,
    category: item.dutyDivNam || item.dutyDivName || (kind === 'pharmacy' ? '약국' : ''),
    address: item.dutyAddr || '',
    phone: item.dutyTel1 || '',
    lat: hasPos ? lat : null,
    lon: hasPos ? lon : null,
    distanceM: origin && hasPos ? distanceM(origin.lat, origin.lon, lat, lon) : null,
    emergencyRoom: String(item.dutyEryn ?? '') === '1',
    departments,
    status: openStatus(item, now),
  };
}

// 주소 "서울특별시 종로구 …"에서 시도/시군구를 뽑는다. 첫 번째 결과가 대표.
function regionFromAddress(addr = '') {
  const area = parseArea(addr.split(/\s+/).slice(0, 3).join(' '));
  return area?.sido ? area : null;
}

function sigunguCandidates(sigungu) {
  if (!sigungu) return [undefined];
  const parts = sigungu.split(' ');
  // "성남시 분당구"가 안 되면 "성남시"로 한 번 더
  return parts.length > 1 ? [sigungu, parts[0]] : [sigungu];
}

async function listByRegion(kind, area, extra) {
  const sidos = [area.sido, SIDO_ALIASES[area.sido]].filter(Boolean);
  for (const sido of sidos) {
    for (const sigungu of sigunguCandidates(area.sigungu)) {
      const params = { Q0: sido, numOfRows: '500', pageNo: '1', ...extra };
      if (sigungu) params.Q1 = sigungu;
      const items = await call(kind, 'list', params, 60 * 60 * 1000);
      if (items.length) return items;
    }
  }
  return [];
}

function filterAndSort(places, { openNow, emergency, department, limit }) {
  let out = places.filter((p) => p.name);
  if (emergency) out = out.filter((p) => p.emergencyRoom);
  if (department && out.some((p) => p.departments.length)) {
    out = out.filter((p) => !p.departments.length || p.departments.includes(department));
  }
  if (openNow) out = out.filter((p) => p.status.open || (emergency && p.emergencyRoom));
  out.sort((a, b) => {
    if (a.distanceM != null && b.distanceM != null) return a.distanceM - b.distanceM;
    return Number(b.status.open) - Number(a.status.open) || a.name.localeCompare(b.name, 'ko');
  });
  return out.slice(0, limit);
}

/**
 * 주변 병원/약국/응급실 찾기.
 * @param {object} q
 * @param {'hospital'|'pharmacy'|'emergency'} q.kind
 * @param {{lat:number, lon:number}|null} q.location  GPS 위치
 * @param {string} [q.area]        위치가 없을 때 "서울 종로구" 같은 동네 이름
 * @param {string} [q.department]  진료과 이름(예: 정형외과)
 * @param {boolean} [q.openNow]
 */
export async function searchPlaces({ kind = 'hospital', location = null, area = '', department = '', openNow = true, limit = 6 }) {
  const emergency = kind === 'emergency';
  const apiKind = kind === 'pharmacy' ? 'pharmacy' : 'hospital';
  const dept = DEPARTMENTS[department] ? department : '';
  const opts = { openNow, emergency, department: dept, limit };

  if (!isLive()) {
    const origin = location || { lat: 37.5663, lon: 126.9779 }; // 위치를 모르면 서울시청 기준 예시
    const places = mockPlaces(apiKind, origin).map((it) => normalize(it, apiKind, origin));
    return { mock: true, places: filterAndSort(places, opts), where: location ? '현재 위치' : '서울시청(예시)' };
  }

  const now = new Date();
  let region = area ? parseArea(area) : null;
  let candidates = [];

  if (location && !dept && !emergency) {
    // 가까운 곳 목록을 받고, 가까운 몇 곳만 상세정보(진료시간)를 다시 조회한다.
    const near = await call(apiKind, 'nearby', {
      WGS84_LON: String(location.lon), WGS84_LAT: String(location.lat), pageNo: '1', numOfRows: '30',
    }, 10 * 60 * 1000);
    const top = near.slice(0, 12);
    const details = await Promise.all(top.map((n) =>
      call(apiKind, 'detail', { HPID: n.hpid }, 24 * 60 * 60 * 1000)
        .then((d) => ({ ...n, ...(d[0] || {}) }))
        .catch(() => n)));
    candidates = details;
  } else {
    if (location && !region) {
      const near = await call(apiKind, 'nearby', {
        WGS84_LON: String(location.lon), WGS84_LAT: String(location.lat), pageNo: '1', numOfRows: '5',
      }, 10 * 60 * 1000);
      region = regionFromAddress(near[0]?.dutyAddr);
    }
    if (!region?.sido) return { mock: false, places: [], where: area || '현재 위치', error: '동네를 찾지 못했어요' };
    const extra = {};
    if (dept && apiKind === 'hospital') extra.QD = DEPARTMENTS[dept];
    if (openNow && !emergency) extra.QT = String(kstNow(now).dayIndex);
    candidates = await listByRegion(apiKind, region, extra);
    if (dept) candidates = candidates.map((c) => ({ ...c, dgidIdName: c.dgidIdName || dept }));
  }

  const places = candidates.map((it) => normalize(it, apiKind, location, now));
  const where = region ? [region.sido, region.sigungu].filter(Boolean).join(' ') : '현재 위치';
  return { mock: false, places: filterAndSort(places, opts), where };
}

// 지금 문 연 곳이 하나도 없으면, 문 닫은 곳이라도 가까운 순으로 보여 준다(진료시간 확인용).
export async function searchPlacesOrClosest(q) {
  const result = await searchPlaces(q);
  if (!q.openNow || result.places.length || q.kind === 'emergency') return { ...result, allClosed: false };
  const closest = await searchPlaces({ ...q, openNow: false });
  return { ...closest, allClosed: closest.places.length > 0 };
}
