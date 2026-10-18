import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answer } from './assistant.js';
import { searchPlaces, isLive } from './egen.js';
import { isAIEnabled } from './ai.js';
import { GUIDES } from './knowledge.js';
import { sanitizeHealth, extractCheckup } from './health.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 검진 결과지 사진은 크기가 커서 다른 요청보다 먼저, 따로 받는다. 사진은 저장하지 않는다.
app.post('/api/checkup/extract', express.json({ limit: '8mb' }), async (req, res) => {
  if (!isAIEnabled()) return res.status(503).json({ error: '사진 읽기는 AI가 켜져 있을 때만 돼요. 직접 입력해 주세요.' });
  try {
    res.json(await extractCheckup(req.body?.image));
  } catch (err) {
    console.error('[extract]', err.message);
    res.status(err.status || 502).json({ error: err.status ? err.message : '사진을 읽지 못했어요. 직접 입력해 주세요.' });
  }
});

app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(here, '..', 'public')));

function parseLocation(src) {
  const lat = Number(src?.lat);
  const lon = Number(src?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat < 33 || lat > 39 || lon < 124 || lon > 132) return null; // 대한민국 밖 좌표는 무시
  return { lat, lon };
}

app.get('/api/config', (_req, res) => {
  res.json({ ai: isAIEnabled(), liveData: isLive(), photoExtract: isAIEnabled() });
});

app.post('/api/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 500);
  if (!message) return res.status(400).json({ error: '질문이 비어 있어요.' });
  try {
    const out = await answer({
      message,
      history: Array.isArray(req.body.history) ? req.body.history : [],
      location: parseLocation(req.body.location),
      area: String(req.body.area || '').slice(0, 40),
      health: sanitizeHealth(req.body.health),
    });
    res.json(out);
  } catch (err) {
    console.error('[chat]', err);
    res.status(502).json({ error: '정보를 가져오지 못했어요. 잠시 후 다시 해 주세요.' });
  }
});

app.get('/api/places', async (req, res) => {
  const kind = ['hospital', 'pharmacy', 'emergency'].includes(req.query.kind) ? req.query.kind : 'hospital';
  try {
    const result = await searchPlaces({
      kind,
      location: parseLocation(req.query),
      area: String(req.query.area || ''),
      department: String(req.query.department || ''),
      openNow: req.query.openNow !== 'false',
      limit: 10,
    });
    res.json(result);
  } catch (err) {
    console.error('[places]', err);
    res.status(502).json({ error: '병원 정보를 가져오지 못했어요.' });
  }
});

app.get('/api/guides/:id', (req, res) => {
  const guide = GUIDES[req.params.id];
  if (!guide) return res.status(404).json({ error: '없는 안내예요.' });
  res.json(guide);
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`병원 길잡이: http://localhost:${port}`);
  console.log(`  AI 안내: ${isAIEnabled() ? '켜짐' : '꺼짐(ANTHROPIC_API_KEY 없음 → 기본 안내)'}`);
  console.log(`  병원 데이터: ${isLive() ? 'E-GEN 실데이터' : '예시 데이터(EGEN_SERVICE_KEY 없음)'}`);
});
