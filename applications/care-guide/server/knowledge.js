// 앱이 기본으로 알고 있는 지식: 진료과 코드, 증상→진료과 규칙, 응급 신호, 서류 안내.
// AI가 꺼져 있어도 이 파일만으로 기본 안내가 돌아가도록 만든다.

// 국립중앙의료원(E-GEN) 병·의원 API의 진료과목 코드(QD).
// 공공데이터포털 활용가이드의 코드표와 대조해 쓰세요.
export const DEPARTMENTS = {
  내과: 'D001',
  소아청소년과: 'D002',
  신경과: 'D003',
  정신건강의학과: 'D004',
  피부과: 'D005',
  외과: 'D006',
  흉부외과: 'D007',
  정형외과: 'D008',
  신경외과: 'D009',
  산부인과: 'D011',
  안과: 'D012',
  이비인후과: 'D013',
  비뇨의학과: 'D014',
  재활의학과: 'D016',
  마취통증의학과: 'D017',
  가정의학과: 'D022',
  응급의학과: 'D024',
  치과: 'D026',
};

export const DEPARTMENT_NAMES = Object.keys(DEPARTMENTS);

// 119를 먼저 안내해야 하는 말들. 하나라도 걸리면 응급 안내를 맨 위에 띄운다.
const EMERGENCY_PATTERNS = [
  /가슴.{0,6}(아프|아파|조이|조여|답답|짓눌|통증)/,
  /흉통/,
  /숨.{0,4}(안\s*쉬|못\s*쉬|막히|막혀|차서|가빠|가쁘)/,
  /호흡\s*곤란/,
  /의식.{0,4}(없|잃|흐려)/,
  /(쓰러|기절|실신)/,
  /(마비|감각이\s*없)/,
  /(한쪽|반쪽).{0,8}(팔|다리|얼굴|몸)/,
  /(말이|발음이).{0,4}(어눌|안\s*나|꼬)/,
  /입이.{0,4}돌아/,
  /(피를|피가).{0,6}(토|쏟|많이|안\s*멈)/,
  /(경련|발작)/,
  /갑자기.{0,8}(심한|극심한).{0,4}두통/,
  /(약을|약).{0,6}(많이|잘못)\s*먹/,
];

export function detectEmergency(text = '') {
  return EMERGENCY_PATTERNS.some((re) => re.test(text));
}

// 증상 키워드 → 진료과. 위에서부터 먼저 걸리는 규칙을 쓴다.
const SYMPTOM_RULES = [
  { dept: '치과', words: ['이가', '이빨', '치아', '잇몸', '틀니', '임플란트', '사랑니', '충치'] },
  { dept: '안과', words: ['눈이', '눈앞', '눈물', '시력', '침침', '백내장', '녹내장', '충혈', '눈곱', '눈'] },
  { dept: '이비인후과', words: ['귀가', '귀에', '귀', '이명', '청력', '잘 안 들', '콧물', '코막', '코가', '비염', '목이 아파', '목이 따끔', '편도', '목소리'] },
  { dept: '피부과', words: ['가려', '두드러기', '발진', '습진', '무좀', '피부', '물집', '사마귀', '대상포진'] },
  { dept: '비뇨의학과', words: ['소변', '오줌', '전립선', '요실금', '혈뇨', '방광'] },
  { dept: '정형외과', words: ['무릎', '허리', '어깨', '관절', '발목', '손목', '뼈', '골절', '삐었', '삐끗', '목이 뻐근', '오십견', '디스크', '넘어'] },
  { dept: '신경과', words: ['두통', '머리가 아', '손떨림', '손이 떨', '기억력', '깜빡', '치매', '저려', '저림', '어지러', '어지럼'] },
  { dept: '정신건강의학과', words: ['잠이 안', '불면', '우울', '불안', '기운이 없고 슬', '공황'] },
  { dept: '산부인과', words: ['생리', '폐경', '질염', '자궁', '유방'] },
  { dept: '재활의학과', words: ['재활', '걷기가 힘', '뇌졸중 후', '수술 후 재활'] },
  { dept: '내과', words: ['열이', '열나', '기침', '가래', '감기', '몸살', '배가 아', '배아', '속이', '속쓰', '소화', '체했', '설사', '변비', '구토', '토할', '혈압', '당뇨', '갑상선', '숨이 차', '피곤', '기운이 없'] },
];

export function suggestDepartments(text = '') {
  const found = [];
  for (const rule of SYMPTOM_RULES) {
    if (rule.words.some((w) => text.includes(w)) && !found.includes(rule.dept)) found.push(rule.dept);
  }
  return found;
}

// 서류 안내. 보험사·병원마다 조금씩 다르므로 문구에 '확인'을 꼭 넣는다.
export const GUIDES = {
  tertiary_hospital: {
    id: 'tertiary_hospital',
    title: '큰 병원(대학병원·상급종합병원) 처음 갈 때',
    summary: '동네 병원에서 받은 진료의뢰서가 없으면 건강보험이 적용되지 않아 진료비를 훨씬 많이 내실 수 있어요.',
    items: [
      { name: '진료의뢰서', detail: '다니던 동네 의원이나 병원에서 받아요. "큰 병원 가려고 하니 진료의뢰서 써 주세요"라고 말씀하시면 돼요.', required: true },
      { name: '신분증', detail: '주민등록증, 운전면허증, 여권, 또는 휴대폰의 모바일 건강보험증. 2024년 5월부터 병원에서 본인 확인을 해요.', required: true },
      { name: '진료 예약 확인', detail: '대학병원은 대부분 예약이 필요해요. 병원 대표번호로 전화해 예약하세요.', required: true },
      { name: '이전 검사 기록', detail: 'CT·MRI 영상 CD, 판독지, 피검사 결과지 등. 다니던 병원 원무과나 의무기록실에서 발급해요. 검사를 다시 안 해도 될 수 있어요.', required: false },
      { name: '소견서', detail: '의사 선생님의 의견이 적힌 서류. 있으면 진료가 빨라져요.', required: false },
      { name: '드시는 약 목록', detail: '약봉투나 처방전을 챙기거나, 휴대폰으로 사진을 찍어 가세요.', required: false },
    ],
    tips: [
      '응급실 진료, 분만, 치과 등은 진료의뢰서 없이도 건강보험이 적용되는 예외가 있어요. 병원에 확인하세요.',
      '영상 CD는 진료 전에 병원에 미리 등록해야 하는 경우가 많아요. 일찍 도착하세요.',
      '가능하면 보호자와 함께 가세요.',
    ],
  },
  insurance_outpatient: {
    id: 'insurance_outpatient',
    title: '실손보험 청구 — 통원(외래) 진료',
    summary: '병원비와 약값을 돌려받으려면 영수증과 세부내역서가 기본이에요.',
    items: [
      { name: '진료비 영수증', detail: '병원 수납 창구에서 받아요. "진료비 계산서·영수증"이라고 적혀 있어요.', required: true },
      { name: '진료비 세부내역서', detail: '비급여(보험 안 되는) 항목이 있을 때 필요해요. 수납 창구에 달라고 하세요.', required: true },
      { name: '약제비 영수증', detail: '약국에서 받아요.', required: false },
      { name: '처방전 또는 진단서', detail: '청구 금액이 크면 질병분류코드가 적힌 처방전(환자 보관용)이나 진단서를 요구하기도 해요. 기준은 보험사마다 달라요.', required: false },
    ],
    tips: [
      '"실손24" 앱이나 누리집에서 신청하면 병원이 보험사로 서류를 바로 보내 줘요(참여한 병원·약국만).',
      '보험금은 진료일로부터 3년 안에 청구해야 해요.',
      '정확한 서류는 가입한 보험사 고객센터나 앱에서 꼭 확인하세요.',
    ],
  },
  insurance_inpatient: {
    id: 'insurance_inpatient',
    title: '실손보험 청구 — 입원·수술',
    summary: '입원했다면 입·퇴원확인서가 꼭 필요해요. 수술했다면 수술확인서도 챙기세요.',
    items: [
      { name: '입·퇴원확인서', detail: '질병분류코드가 적힌 것으로 받으세요.', required: true },
      { name: '진료비 영수증', detail: '퇴원할 때 수납 창구에서 받아요.', required: true },
      { name: '진료비 세부내역서', detail: '비급여 항목 확인용이에요.', required: true },
      { name: '수술확인서', detail: '수술을 받았을 때 필요해요.', required: false },
      { name: '진단서', detail: '보험사에 따라 요구할 수 있어요.', required: false },
    ],
    tips: [
      '퇴원하는 날 원무과에서 한꺼번에 발급받으면 다시 가지 않아도 돼요.',
      '보험금은 3년 안에 청구해야 해요.',
    ],
  },
  insurance_diagnosis: {
    id: 'insurance_diagnosis',
    title: '진단비·수술비 보험 청구(암·뇌·심장 등)',
    summary: '정해진 금액을 받는 보험은 진단서가 핵심이에요.',
    items: [
      { name: '진단서', detail: '질병분류코드와 진단 날짜가 적힌 것.', required: true },
      { name: '조직검사 결과지', detail: '암 진단비 청구 때 대부분 필요해요.', required: false },
      { name: '검사 판독지', detail: 'CT·MRI 등 영상 검사 결과. 뇌·심장 질환 때 요구할 수 있어요.', required: false },
      { name: '수술확인서', detail: '수술비를 청구할 때.', required: false },
      { name: '입·퇴원확인서', detail: '입원비를 청구할 때.', required: false },
    ],
    tips: ['보험 약관마다 필요한 서류가 다르니 보험사에 먼저 전화해 보세요.'],
  },
  proxy: {
    id: 'proxy',
    title: '가족이 대신 서류를 떼러 갈 때',
    summary: '환자 본인이 아닌 사람이 진료기록을 받으려면 동의서와 위임장이 필요해요.',
    items: [
      { name: '환자 동의서와 위임장', detail: '병원 누리집이나 원무과에 양식이 있어요. 환자가 직접 서명해요.', required: true },
      { name: '환자 신분증 사본', detail: '', required: true },
      { name: '가는 사람 신분증', detail: '', required: true },
      { name: '가족관계증명서', detail: '가족이 대신 갈 때 요구해요.', required: false },
    ],
    tips: ['병원마다 양식과 요구 서류가 조금씩 달라요. 가기 전에 전화로 확인하세요.'],
  },
};

export function guideFor(text = '') {
  if (/(대신|위임|자녀가|아들이|딸이)/.test(text) && /(서류|발급|떼)/.test(text)) return GUIDES.proxy;
  if (/(입원|수술)/.test(text) && /(보험|청구)/.test(text)) return GUIDES.insurance_inpatient;
  if (/(진단비|암보험|수술비)/.test(text)) return GUIDES.insurance_diagnosis;
  if (/(보험|청구|실손|실비)/.test(text)) return GUIDES.insurance_outpatient;
  if (/(대학병원|큰\s*병원|3차|삼차|상급종합|종합병원|의뢰서)/.test(text)) return GUIDES.tertiary_hospital;
  return null;
}

// 시도 이름을 E-GEN이 쓰는 정식 이름으로 맞춘다.
const SIDO = {
  서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 광주: '광주광역시',
  대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도',
  충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전남: '전라남도', 경북: '경상북도',
  경남: '경상남도', 제주: '제주특별자치도',
};
const SIDO_LONG = Object.values(SIDO);

// "서울 종로구", "경기도 성남시 분당구" 같은 말을 { sido, sigungu }로 나눈다.
export function parseArea(text = '') {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return null;
  let sido = null;
  let rest = tokens;
  const first = tokens[0];
  if (SIDO_LONG.includes(first)) sido = first;
  else {
    const key = Object.keys(SIDO).find((k) => first.startsWith(k));
    if (key) sido = SIDO[key];
  }
  if (sido) rest = tokens.slice(1);
  const sigungu = rest.filter((t) => /(시|군|구)$/.test(t)).slice(0, 2).join(' ') || null;
  if (!sido && !sigungu) return null;
  return { sido, sigungu };
}
