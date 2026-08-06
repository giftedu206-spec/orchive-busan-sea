import { GoogleGenAI } from '@google/genai';

// Vercel에서 실행되는 서버 전용 AI 분석 API입니다.
// GEMINI_API_KEY는 Vercel 환경 변수에만 넣고 브라우저나 GitHub에는 올리지 않습니다.
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 사용할 수 있습니다.' });
  if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: '서버에 GEMINI_API_KEY가 설정되지 않았습니다.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { imageData, place } = body || {};
    if (!imageData?.startsWith('data:image/')) throw new Error('사진 파일을 올려주세요.');

    const [header, data] = imageData.split(',');
    const mimeType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await client.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: [{
        role: 'user',
        parts: [{
          text: `당신은 부산 해양 생물 전문가입니다. 사진 속 생물을 분석하세요. 발견 위치: ${place || '미입력'}.
반드시 아래 JSON 객체만 반환하세요. 생물 식별이 불확실하면 name은 "식별 중인 해양 생물"로 정하고, 위험도는 보수적으로 1~3 사이로 판단하세요.
{"name":"한국어 생물 이름","latin":"학명 또는 추정 학명","type":"위험 생물|해파리|연체동물|어류|기타","danger":1부터5까지의정수,"note":"사진을 근거로 한 짧은 특징 설명","confidence":0부터100까지의정수}`
        }, { inlineData: { mimeType, data } }]
      }],
      config: { responseMimeType: 'application/json', temperature: 0.2 }
    });

    const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
    const validTypes = ['위험 생물', '해파리', '연체동물', '어류', '기타'];
    return res.status(200).json({
      name: String(parsed.name || '식별 중인 해양 생물'),
      latin: String(parsed.latin || '학명 확인 필요'),
      type: validTypes.includes(parsed.type) ? parsed.type : '기타',
      danger: Math.max(1, Math.min(5, Number(parsed.danger) || 1)),
      note: String(parsed.note || '사진을 기반으로 AI가 분석한 해양 생물입니다.'),
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 70))
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Gemini AI 분석 중 오류가 발생했습니다.' });
  }
}
