const form = document.querySelector('#chatForm');
const input = document.querySelector('#messageInput');
const messages = document.querySelector('#messages');
const promptChips = document.querySelector('#promptChips');
const clearButton = document.querySelector('#clearButton');
const dateLabel = document.querySelector('#dateLabel');
const authModal = document.querySelector('#authModal');
const authForm = document.querySelector('#authForm');
const authError = document.querySelector('#authError');
const accountArea = document.querySelector('#accountArea');
const state = { messages: [], token: localStorage.getItem('mindful_token'), user: null, socket: null, selectedUser: null };

dateLabel.textContent = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' }).format(new Date());

function addMessage(role, content, container = messages) {
  const article = document.createElement('article');
  article.className = `message ${role === 'assistant' ? 'assistant-message' : 'user-message'}`;
  article.innerHTML = role === 'assistant' ? '<div class="avatar">◒</div><div class="bubble"><p></p><time>방금 전</time></div>' : '<div class="bubble"><p></p><time>방금 전</time></div>';
  article.querySelector('p').textContent = content;
  container.append(article);
  container.scrollTop = container.scrollHeight;
  return article;
}

function setLoading(isLoading) { const button = form.querySelector('button'); button.disabled = isLoading; button.textContent = isLoading ? '…' : '↑'; }

async function sendMessage(content) {
  const cleanContent = content.trim();
  if (!cleanContent) return;
  promptChips?.remove(); input.value = ''; input.style.height = 'auto'; state.messages.push({ role: 'user', content: cleanContent }); addMessage('user', cleanContent); setLoading(true);
  const loading = addMessage('assistant', ''); loading.querySelector('.bubble p').innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  try { const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: state.messages }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); loading.querySelector('.bubble p').textContent = data.reply; state.messages.push({ role: 'assistant', content: data.reply }); }
  catch (error) { loading.querySelector('.bubble p').textContent = error.message || '상담 연결이 잠시 불안정합니다.'; }
  finally { setLoading(false); input.focus(); }
}

function showAuth(mode = 'login') { authModal.classList.remove('hidden'); setAuthMode(mode); document.querySelector('#authEmail').focus(); }
function setAuthMode(mode) { document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authMode === mode)); document.querySelectorAll('.signup-only').forEach((element) => element.classList.toggle('hidden', mode !== 'signup')); document.querySelector('#authTitle').textContent = mode === 'signup' ? '마음 친구가 되어주세요.' : '다시 만나서 반가워요.'; document.querySelector('#authSubmit').textContent = mode === 'signup' ? '계정 만들기' : '로그인하기'; authForm.dataset.mode = mode; authError.textContent = ''; }
function renderAccount() { accountArea.innerHTML = state.user ? `<span class="welcome-user">${state.user.nickname}님</span><button class="account-button" id="logoutButton" type="button">로그아웃</button>` : '<button class="account-button" id="openAuthButton" type="button">로그인 / 가입</button>'; document.querySelector('#openAuthButton')?.addEventListener('click', () => showAuth()); document.querySelector('#logoutButton')?.addEventListener('click', logout); }
async function authenticate(event) { event.preventDefault(); const mode = authForm.dataset.mode; const body = { email: document.querySelector('#authEmail').value, password: document.querySelector('#authPassword').value }; if (mode === 'signup') body.nickname = document.querySelector('#authNickname').value; try { const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); state.token = data.token; state.user = data.user; localStorage.setItem('mindful_token', state.token); authModal.classList.add('hidden'); authForm.reset(); renderAccount(); connectSocket(); loadPeople(); } catch (error) { authError.textContent = error.message; } }
function logout() { state.socket?.close(); state.socket = null; state.user = null; state.token = null; localStorage.removeItem('mindful_token'); renderAccount(); document.querySelector('#peopleList').innerHTML = '<div class="empty-people">로그인하면 마음 친구를 만날 수 있어요.<button class="text-button" id="communityLogin" type="button">로그인 / 회원가입</button></div>'; document.querySelector('#communityLogin').addEventListener('click', () => showAuth('signup')); }
function connectSocket() { if (!state.token || state.socket) return; state.socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${state.token}`); state.socket.onmessage = (event) => { const data = JSON.parse(event.data); if (data.type === 'message' && (data.message.from === state.selectedUser?.id || data.message.to === state.selectedUser?.id)) addMessage(data.message.from === state.user.id ? 'user' : 'assistant', data.message.text, document.querySelector('#directMessages')); }; state.socket.onclose = () => { state.socket = null; }; }
async function loadPeople() { const list = document.querySelector('#peopleList'); if (!state.user) { list.innerHTML = '<div class="empty-people">로그인하면 마음 친구를 만날 수 있어요.<button class="text-button" id="communityLogin" type="button">로그인 / 회원가입</button></div>'; document.querySelector('#communityLogin').addEventListener('click', () => showAuth('signup')); return; } const response = await fetch('/api/community/users', { headers: { Authorization: `Bearer ${state.token}` } }); const data = await response.json(); document.querySelector('#onlineCount').textContent = data.users.filter((user) => user.online).length; list.innerHTML = data.users.length ? data.users.map((user) => `<button class="person-row" data-user-id="${user.id}" type="button"><span class="person-avatar">${user.nickname.slice(0, 1)}</span><span><strong>${user.nickname}</strong><small><i class="${user.online ? 'online' : ''}"></i>${user.online ? '지금 온라인' : '잠시 쉬는 중'}</small></span><span class="person-arrow">→</span></button>`).join('') : '<div class="empty-people">아직 다른 마음 친구가 없어요.<br />친구가 가입하면 이곳에서 만날 수 있어요.</div>'; list.querySelectorAll('.person-row').forEach((row) => row.addEventListener('click', () => openDirectChat(data.users.find((user) => user.id === row.dataset.userId)))); }
function openDirectChat(user) { state.selectedUser = user; document.querySelector('#chatPartner').textContent = user.nickname; document.querySelector('#partnerStatus').textContent = user.online ? '온라인' : '오프라인'; document.querySelector('#peopleList').classList.add('hidden'); document.querySelector('#directChat').classList.remove('hidden'); document.querySelector('#directMessages').innerHTML = `<div class="direct-empty">${user.nickname}님에게 따뜻한 인사를 건네보세요.</div>`; document.querySelector('#directInput').focus(); connectSocket(); }
function sendDirectMessage(event) { event.preventDefault(); const field = document.querySelector('#directInput'); const text = field.value.trim(); if (!text || !state.socket || state.socket.readyState !== WebSocket.OPEN) return; state.socket.send(JSON.stringify({ to: state.selectedUser.id, text })); field.value = ''; }

form.addEventListener('submit', (event) => { event.preventDefault(); sendMessage(input.value); });
input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 120)}px`; });
document.querySelectorAll('.prompt-chips button').forEach((button) => button.addEventListener('click', () => sendMessage(button.textContent)));
clearButton.addEventListener('click', () => { state.messages.length = 0; messages.innerHTML = '<article class="message assistant-message"><div class="avatar">◒</div><div class="bubble"><p>괜찮아요. 다시 천천히 시작해도 돼요. 지금 어떤 마음인가요?</p><time>방금 전</time></div></article>'; input.focus(); });
document.querySelectorAll('.mode-tab').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.mode-tab').forEach((item) => item.classList.toggle('active', item === tab)); const community = tab.dataset.mode === 'community'; document.querySelector('#aiHeading').classList.toggle('hidden', community); document.querySelector('#messages').classList.toggle('hidden', community); document.querySelector('#chatForm').classList.toggle('hidden', community); document.querySelector('.disclaimer').classList.toggle('hidden', community); document.querySelector('#communityView').classList.toggle('hidden', !community); if (community) loadPeople(); }));
document.querySelector('#closeAuthButton').addEventListener('click', () => authModal.classList.add('hidden')); document.querySelector('#openAuthButton').addEventListener('click', () => showAuth()); authModal.addEventListener('click', (event) => { if (event.target === authModal) authModal.classList.add('hidden'); }); document.querySelectorAll('.auth-tab').forEach((tab) => tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode))); authForm.addEventListener('submit', authenticate); document.querySelector('#backToPeople').addEventListener('click', () => { document.querySelector('#directChat').classList.add('hidden'); document.querySelector('#peopleList').classList.remove('hidden'); }); document.querySelector('#directForm').addEventListener('submit', sendDirectMessage);

async function restoreSession() { if (!state.token) return renderAccount(); try { const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${state.token}` } }); if (!response.ok) throw new Error(); state.user = (await response.json()).user; renderAccount(); connectSocket(); } catch { logout(); } }
restoreSession();
