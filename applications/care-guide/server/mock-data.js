// EGEN_SERVICE_KEY가 없을 때 쓰는 예시 데이터. 실제 기관이 아니다.
// 사용자 위치를 중심으로 동서남북 몇백 미터에 흩어 놓아 거리 계산이 그럴듯하게 보이게 한다.
// 필드 이름은 E-GEN 응답과 같게 맞춘다.

const weekday = (s, c) => ({ dutyTime1s: s, dutyTime1c: c, dutyTime2s: s, dutyTime2c: c, dutyTime3s: s, dutyTime3c: c, dutyTime4s: s, dutyTime4c: c, dutyTime5s: s, dutyTime5c: c });
const sat = (s, c) => ({ dutyTime6s: s, dutyTime6c: c });
const sun = (s, c) => ({ dutyTime7s: s, dutyTime7c: c });
const holiday = (s, c) => ({ dutyTime8s: s, dutyTime8c: c });
const everyday = (s, c) => ({ ...weekday(s, c), ...sat(s, c), ...sun(s, c), ...holiday(s, c) });

const HOSPITALS = [
  { dutyName: '(예시) 햇살내과의원', dutyDivNam: '의원', dgidIdName: '내과', dx: 180, dy: 120, ...weekday('0900', '1830'), ...sat('0900', '1300') },
  { dutyName: '(예시) 바른정형외과의원', dutyDivNam: '의원', dgidIdName: '정형외과,재활의학과,마취통증의학과', dx: -260, dy: 90, ...weekday('0900', '1900'), ...sat('0900', '1400') },
  { dutyName: '(예시) 맑은눈안과의원', dutyDivNam: '의원', dgidIdName: '안과', dx: 320, dy: -150, ...weekday('0930', '1830'), ...sat('0930', '1300') },
  { dutyName: '(예시) 소리이비인후과의원', dutyDivNam: '의원', dgidIdName: '이비인후과', dx: -120, dy: -300, ...weekday('0900', '2100'), ...sat('0900', '1500'), ...sun('0900', '1500') },
  { dutyName: '(예시) 고운피부과의원', dutyDivNam: '의원', dgidIdName: '피부과', dx: 450, dy: 260, ...weekday('1000', '1900'), ...sat('1000', '1500') },
  { dutyName: '(예시) 튼튼치과의원', dutyDivNam: '치과의원', dgidIdName: '치과', dx: -380, dy: 340, ...weekday('0930', '1900'), ...sat('0930', '1400') },
  { dutyName: '(예시) 편한비뇨의학과의원', dutyDivNam: '의원', dgidIdName: '비뇨의학과', dx: 600, dy: -40, ...weekday('0900', '1800') },
  { dutyName: '(예시) 우리가정의학과의원', dutyDivNam: '의원', dgidIdName: '가정의학과,내과', dx: 90, dy: 520, ...weekday('0830', '2000'), ...sat('0900', '1700'), ...sun('0900', '1300'), ...holiday('0900', '1300') },
  { dutyName: '(예시) 생각신경과의원', dutyDivNam: '의원', dgidIdName: '신경과', dx: -650, dy: -220, ...weekday('0900', '1800'), ...sat('0900', '1300') },
  { dutyName: '(예시) 마음정신건강의학과의원', dutyDivNam: '의원', dgidIdName: '정신건강의학과', dx: 720, dy: 410, ...weekday('1000', '2000') },
  { dutyName: '(예시) 시민종합병원', dutyDivNam: '종합병원', dutyEryn: '1', dgidIdName: '내과,외과,정형외과,신경과,신경외과,비뇨의학과,안과,이비인후과,피부과,가정의학과,재활의학과,응급의학과', dx: -900, dy: 650, ...weekday('0830', '1730'), ...sat('0830', '1230') },
  { dutyName: '(예시) 한빛대학교병원', dutyDivNam: '상급종합병원', dutyEryn: '1', dgidIdName: '내과,외과,정형외과,신경과,신경외과,흉부외과,산부인과,비뇨의학과,안과,이비인후과,피부과,정신건강의학과,재활의학과,응급의학과,치과', dx: 1500, dy: -1100, ...weekday('0800', '1730') },
];

const PHARMACIES = [
  { dutyName: '(예시) 늘봄약국', dx: 200, dy: 140, ...weekday('0900', '2100'), ...sat('0900', '1800') },
  { dutyName: '(예시) 365온누리약국', dx: -310, dy: -60, ...everyday('0800', '2400') },
  { dutyName: '(예시) 정성약국', dx: 410, dy: -230, ...weekday('0900', '1900'), ...sat('0900', '1500') },
  { dutyName: '(예시) 달빛심야약국', dx: -520, dy: 380, ...everyday('1800', '0200') },
  { dutyName: '(예시) 건강약국', dx: 140, dy: 600, ...weekday('0900', '1830'), ...sat('0900', '1400'), ...holiday('1000', '1600') },
];

const STREETS = ['햇살로', '은행나무길', '시장길', '중앙로', '공원로', '학교길'];

export function mockPlaces(kind, origin) {
  const src = kind === 'pharmacy' ? PHARMACIES : HOSPITALS;
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return src.map(({ dx, dy, ...rest }, i) => ({
    hpid: `MOCK${kind === 'pharmacy' ? 'P' : 'H'}${String(i + 1).padStart(3, '0')}`,
    dutyDivNam: kind === 'pharmacy' ? '약국' : rest.dutyDivNam,
    dutyAddr: `(예시 주소) ${STREETS[i % STREETS.length]} ${10 + i * 7}`,
    dutyTel1: `02-000-${String(1000 + i * 111).slice(0, 4)}`,
    wgs84Lat: String(origin.lat + dy / mPerDegLat),
    wgs84Lon: String(origin.lon + dx / mPerDegLon),
    ...rest,
  }));
}
