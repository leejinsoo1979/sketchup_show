// Vercel Serverless API - SketchUp 웹 동기화
// 메모리 기반 임시 저장 (세션별)

const sessions = new Map();

export default function handler(req, res) {
  // CORS 허용
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { sessionId, action } = req.query;

  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }

  // POST: SketchUp에서 이미지 업로드
  if (req.method === 'POST') {
    const { image, camera, settings, rendered } = req.body;

    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, {
        created: Date.now(),
        source: null,
        rendered: null,
        camera: null,
        settings: null
      });
    }

    const session = sessions.get(sessionId);

    if (image) session.source = image;
    if (rendered) session.rendered = rendered;
    if (camera) session.camera = camera;
    if (settings) session.settings = settings;
    session.updated = Date.now();

    return res.status(200).json({
      success: true,
      sessionId,
      message: 'Synced'
    });
  }

  // GET: 웹앱에서 이미지 가져오기
  if (req.method === 'GET') {
    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // 렌더링 결과만 요청
    if (action === 'rendered') {
      return res.status(200).json({
        rendered: session.rendered,
        updated: session.updated
      });
    }

    return res.status(200).json({
      source: session.source,
      rendered: session.rendered,
      camera: session.camera,
      settings: session.settings,
      updated: session.updated
    });
  }

  // DELETE: 세션 삭제
  if (req.method === 'DELETE') {
    sessions.delete(sessionId);
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
