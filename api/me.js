// GET /api/me — 이메일 + 크레딧 잔액
import { cors, verifyUser, getBalance } from './_lumanova.js'

export default async function handler(req, res) {
  cors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  const user = await verifyUser(req)
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' })
  try {
    const balance = await getBalance(user)
    return res.status(200).json({ email: user.email, balance })
  } catch (err) {
    return res.status(500).json({ error: 'BALANCE_FAILED', detail: String(err.message) })
  }
}
