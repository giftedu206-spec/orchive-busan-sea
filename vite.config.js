import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';

// The Gemini key is read only by Vite's Node server, never by the browser.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    // GitHub Pages serves this repository below /orchive-busan-sea/.
    base: process.env.GITHUB_ACTIONS ? '/orchive-busan-sea/' : '/',
    plugins: [
      react(),
      {
        name: 'orchive-gemini-analysis',
        configureServer(server) {
          server.middlewares.use('/api/analyze', async (req, res) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            if (req.method !== 'POST') {
              res.statusCode = 405;
              return res.end(JSON.stringify({ error: 'POST 요청만 사용할 수 있습니다.' }));
            }
            if (!env.GEMINI_API_KEY) {
              res.statusCode = 500;
              return res.end(JSON.stringify({ error: '.env 파일에 GEMINI_API_KEY를 설정해 주세요.' }));
            }

            try {
              let raw = '';
              for await (const chunk of req) raw += chunk;
              const { imageData, place } = JSON.parse(raw);
              if (!imageData?.startsWith('data:image/')) throw new Error('사진 파일을 올려주세요.');

              const [header, data] = imageData.split(',');
              const mimeType = header.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
              const client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
              const result = await client.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: [{
                  role: 'user',
                  parts: [
                    {
                      text: `당신은 부산 해양 생물 전문가입니다. 사진 속 생물을 분석하세요. 발견 위치: ${place || '미입력'}.
반드시 아래 JSON 객체만 반환하세요. 생물 식별이 불확실하면 name은 "식별 중인 해양 생물"로 정하고, 위험도는 보수적으로 1~3 사이로 판단하세요.
{"name":"한국어 생물 이름","latin":"학명 또는 추정 학명","type":"위험 생물|해파리|연체동물|어류|기타","danger":1부터5까지의정수,"note":"사진을 근거로 한 짧은 특징 설명","confidence":0부터100까지의정수}`
                    },
                    { inlineData: { mimeType, data } }
                  ]
                }],
                config: { responseMimeType: 'application/json', temperature: 0.2 }
              });

              const parsed = JSON.parse(result.text.replace(/```json|```/g, '').trim());
              const validTypes = ['위험 생물', '해파리', '연체동물', '어류', '기타'];
              res.end(JSON.stringify({
                name: String(parsed.name || '식별 중인 해양 생물'),
                latin: String(parsed.latin || '학명 확인 필요'),
                type: validTypes.includes(parsed.type) ? parsed.type : '기타',
                danger: Math.max(1, Math.min(5, Number(parsed.danger) || 1)),
                note: String(parsed.note || '사진을 기반으로 AI가 분석한 해양 생물입니다.'),
                confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 70))
              }));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: error.message || 'Gemini AI 분석 중 오류가 발생했습니다.' }));
            }
          });
        }
      }
    ]
  };
});
