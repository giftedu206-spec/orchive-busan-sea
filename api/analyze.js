export default async function handler(req, res) {
  // GitHub Pages is a static site, so it calls this Vercel API from another origin.
  res.setHeader('Access-Control-Allow-Origin', 'https://giftedu206-spec.github.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { imageData, place } = body || {};
    if (!imageData?.startsWith('data:image/')) throw new Error('사진 파일을 올려주세요.');
    const [header, data] = imageData.split(',');
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const prompt = `당신은 부산 해양 생물 전문가입니다. 사진 속 생물을 분석하세요. 발견 위치: ${place || '미입력'}.
반드시 JSON 객체만 반환하세요. 불확실하면 name을 식별 중인 해양 생물로 하세요. danger는 1~5 정수입니다. rare는 희귀 생물일 때만 true, 그 외에는 false입니다.
{"name":"한국어 생물 이름","latin":"학명 또는 추정 학명","type":"위험 생물|해파리|연체동물|어류|기타","danger":1,"rare":false,"note":"사진 근거를 짧게 설명","confidence":70}`;
    const apiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data } }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })
    });
    if (!apiResponse.ok) throw new Error(`Gemini API 오류 (${apiResponse.status})`);
    const json = await apiResponse.json();
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('분석 결과가 비어 있습니다.');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    const types = ['위험 생물', '해파리', '연체동물', '어류', '기타'];
    return res.status(200).json({ name: String(parsed.name || '식별 중인 해양 생물'), latin: String(parsed.latin || '학명 확인 중'), type: types.includes(parsed.type) ? parsed.type : '기타', danger: Math.max(1, Math.min(5, Number(parsed.danger) || 1)), rare: parsed.rare === true, note: String(parsed.note || '사진을 바탕으로 분석했습니다.'), confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 70)) });
  } catch (error) { return res.status(500).json({ error: error.message || 'AI 분석 중 오류가 발생했습니다.' }); }
}
