import 'dotenv/config';
import express from 'express';
import http from 'node:http';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Groq from 'groq-sdk';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = http.createServer(app);
const webSocketServer = new WebSocketServer({ server, path: '/ws' });
const port = process.env.PORT || 3000;
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const accountsPath = path.join(__dirname, 'accounts.json');
const sessions = new Map();
const sockets = new Map();
let accounts = [];

async function loadAccounts() {
  try { accounts = JSON.parse(await fs.readFile(accountsPath, 'utf8')); }
  catch { accounts = []; }
}

async function saveAccounts() {
  await fs.writeFile(accountsPath, JSON.stringify(accounts, null, 2));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

function passwordMatches(password, account) {
  const { hash } = hashPassword(password, account.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(account.passwordHash, 'hex'));
}

function publicAccount(account) { return { id: account.id, nickname: account.nickname }; }

function accountFromRequest(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  return token ? accounts.find((account) => sessions.get(token) === account.id) : null;
}

function requireAccount(req, res, next) {
  const account = accountFromRequest(req);
  if (!account) return res.status(401).json({ error: '로그인이 필요합니다.' });
  req.account = account;
  next();
}

app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/auth/signup', async (req, res) => {
  const nickname = String(req.body.nickname || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (nickname.length < 2 || nickname.length > 20) return res.status(400).json({ error: '닉네임은 2~20자로 입력해 주세요.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: '올바른 이메일을 입력해 주세요.' });
  if (password.length < 6) return res.status(400).json({ error: '비밀번호는 6자 이상이어야 합니다.' });
  if (accounts.some((account) => account.email === email)) return res.status(409).json({ error: '이미 가입된 이메일입니다.' });
  const credentials = hashPassword(password);
  const account = { id: crypto.randomUUID(), nickname, email, salt: credentials.salt, passwordHash: credentials.hash, createdAt: new Date().toISOString() };
  accounts.push(account);
  await saveAccounts();
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, account.id);
  res.status(201).json({ token, user: publicAccount(account) });
});

app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const account = accounts.find((item) => item.email === email);
  if (!account || !passwordMatches(password, account)) return res.status(401).json({ error: '이메일 또는 비밀번호를 확인해 주세요.' });
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, account.id);
  res.json({ token, user: publicAccount(account) });
});

app.get('/api/auth/me', requireAccount, (req, res) => res.json({ user: publicAccount(req.account) }));

app.get('/api/community/users', requireAccount, (req, res) => {
  res.json({ users: accounts.filter((account) => account.id !== req.account.id).map((account) => ({ ...publicAccount(account), online: sockets.has(account.id) })) });
});

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!groq) {
    return res.status(503).json({ error: 'GROQ_API_KEY가 설정되지 않았습니다. .env 파일을 확인해 주세요.' });
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: '상담 메시지를 입력해 주세요.' });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: 'openai/gpt-oss-20b',
      temperature: 0.65,
      max_tokens: 900,
      messages: [
        {
          role: 'system',
          content: '당신은 따뜻하고 차분한 한국어 상담 동반자입니다. 사용자의 감정을 먼저 공감하고, 판단하지 않으며, 지금 할 수 있는 작고 현실적인 다음 행동을 제안하세요. 진단이나 단정은 하지 마세요. 자해, 타해, 학대 등 긴급 위험이 감지되면 즉시 112 또는 자살예방상담전화 109, 정신건강위기상담전화 1577-0199에 연락하도록 안내하세요. 답변은 3~5개의 짧은 문단으로 작성하세요.'
        },
        ...messages.slice(-12).map(({ role, content }) => ({ role, content: String(content).slice(0, 4000) }))
      ]
    });

    res.json({ reply: completion.choices[0]?.message?.content || '잠시 생각을 정리하고 있어요. 한 번 더 말씀해 주시겠어요?' });
  } catch (error) {
    console.error('Groq request failed:', error.message);
    res.status(502).json({ error: '상담 연결이 잠시 불안정합니다. 잠시 후 다시 시도해 주세요.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

webSocketServer.on('connection', (socket, request) => {
  const token = new URL(request.url, `http://${request.headers.host}`).searchParams.get('token');
  const accountId = sessions.get(token);
  if (!accountId) return socket.close(1008, '로그인이 필요합니다.');
  sockets.set(accountId, socket);
  socket.send(JSON.stringify({ type: 'ready', userId: accountId }));
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());
      const text = String(message.text || '').trim().slice(0, 1000);
      const target = accounts.find((account) => account.id === message.to);
      if (!text || !target) return;
      const payload = JSON.stringify({ type: 'message', message: { id: crypto.randomUUID(), from: accountId, fromNickname: accounts.find((account) => account.id === accountId).nickname, to: target.id, text, sentAt: new Date().toISOString() } });
      socket.send(payload);
      sockets.get(target.id)?.send(payload);
    } catch { socket.send(JSON.stringify({ type: 'error', error: '메시지를 보낼 수 없습니다.' })); }
  });
  socket.on('close', () => { if (sockets.get(accountId) === socket) sockets.delete(accountId); });
});

await loadAccounts();
server.listen(port, () => {
  console.log(`Mindful Counsel is running at http://localhost:${port}`);
});
