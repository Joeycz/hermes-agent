const state = {
  workspace: null,
  sessions: [],
  activeSessionId: null,
  messages: [],
  streamingText: '',
  tools: [],
  settings: null,
  pendingApproval: null,
  pendingClarify: null,
  busy: false,
};

const els = {
  workspacePath: document.getElementById('workspace-path'),
  statusLine: document.getElementById('status-line'),
  activeTitle: document.getElementById('active-title'),
  sessionsList: document.getElementById('sessions-list'),
  messages: document.getElementById('messages'),
  toolTimeline: document.getElementById('tool-timeline'),
  promptInput: document.getElementById('prompt-input'),
  modelInput: document.getElementById('model-input'),
  toolsetsInput: document.getElementById('toolsets-input'),
  approvalsSelect: document.getElementById('approvals-select'),
  cwdInput: document.getElementById('cwd-input'),
  modalBackdrop: document.getElementById('modal-backdrop'),
  modalTitle: document.getElementById('modal-title'),
  modalBody: document.getElementById('modal-body'),
  modalActions: document.getElementById('modal-actions'),
};

async function boot() {
  bindUI();
  window.hermesDesktop.onEvent(handleRuntimeEvent);
  window.hermesDesktop.onStderr((text) => {
    console.log(text);
  });
  await refreshConfig();
  await refreshSessions();
}

function bindUI() {
  document.getElementById('pick-workspace-btn').addEventListener('click', chooseWorkspace);
  document.getElementById('refresh-sessions-btn').addEventListener('click', refreshSessions);
  document.getElementById('new-session-btn').addEventListener('click', createSession);
  document.getElementById('send-btn').addEventListener('click', sendPrompt);
  document.getElementById('stop-btn').addEventListener('click', interruptRun);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
}

async function chooseWorkspace() {
  const picked = await window.hermesDesktop.pickWorkspace();
  if (picked) {
    state.workspace = picked;
    renderWorkspace();
  }
}

async function refreshConfig() {
  const response = await window.hermesDesktop.command('config.get');
  state.settings = response.config;
  renderSettings();
}

async function refreshSessions() {
  const response = await window.hermesDesktop.command('session.list', { limit: 100 });
  state.sessions = response.sessions || [];
  renderSessions();
}

async function createSession() {
  if (!state.workspace) {
    await chooseWorkspace();
    if (!state.workspace) {
      return;
    }
  }
  const response = await window.hermesDesktop.command('session.start', {
    cwd: state.workspace,
    model: state.settings?.model || '',
    toolsets: state.settings?.toolsets || [],
  });
  activateSession(response);
  await refreshSessions();
}

async function resumeSession(sessionId) {
  const response = await window.hermesDesktop.command('session.resume', { session_id: sessionId });
  activateSession(response);
}

async function sendPrompt() {
  const text = els.promptInput.value.trim();
  if (!text) {
    return;
  }
  if (!state.activeSessionId) {
    await createSession();
    if (!state.activeSessionId) {
      return;
    }
  }
  state.messages.push({ role: 'user', content: text });
  state.streamingText = '';
  state.busy = true;
  els.promptInput.value = '';
  renderMessages();
  renderStatus('Running Hermes...');
  await window.hermesDesktop.command('message.send', {
    session_id: state.activeSessionId,
    text,
  });
}

async function interruptRun() {
  if (!state.activeSessionId || !state.busy) {
    return;
  }
  await window.hermesDesktop.command('agent.interrupt', { session_id: state.activeSessionId });
}

async function saveSettings() {
  await window.hermesDesktop.command('config.set', {
    key: 'model',
    value: els.modelInput.value,
  });
  await window.hermesDesktop.command('config.set', {
    key: 'toolsets',
    value: els.toolsetsInput.value.split(',').map((item) => item.trim()).filter(Boolean),
  });
  await window.hermesDesktop.command('config.set', {
    key: 'approvals_mode',
    value: els.approvalsSelect.value,
  });
  await window.hermesDesktop.command('config.set', {
    key: 'cwd',
    value: els.cwdInput.value,
  });
  await refreshConfig();
  renderStatus('Settings saved');
}

function activateSession(session) {
  state.activeSessionId = session.session_id;
  state.workspace = session.cwd || state.workspace;
  state.messages = normalizeMessages(session.messages || []);
  state.streamingText = '';
  state.tools = [];
  state.busy = Boolean(session.busy);
  renderWorkspace();
  renderMessages();
  renderTools();
  renderSessions();
  renderStatus(session.busy ? 'Running Hermes...' : 'Session ready');
}

function handleRuntimeEvent(message) {
  const { type, payload } = message;
  if (!payload) {
    return;
  }
  switch (type) {
    case 'ready':
      renderStatus(`Hermes sidecar ready (pid ${payload.pid})`);
      break;
    case 'session.updated':
      updateSession(payload);
      break;
    case 'message.delta':
      if (payload.session_id === state.activeSessionId) {
        state.streamingText += payload.delta || '';
        renderMessages();
      }
      break;
    case 'message.final':
      if (payload.session_id === state.activeSessionId) {
        state.streamingText = '';
        state.messages = normalizeMessages(payload.messages || []);
        state.busy = false;
        renderMessages();
        renderStatus(payload.interrupted ? 'Run interrupted' : 'Run completed');
      }
      refreshSessions();
      break;
    case 'tool.started':
    case 'tool.completed':
      if (payload.session_id === state.activeSessionId) {
        updateToolTimeline(type, payload);
      }
      break;
    case 'approval.requested':
      showApprovalModal(payload);
      break;
    case 'clarify.requested':
      showClarifyModal(payload);
      break;
    case 'config.updated':
      state.settings = payload.config;
      renderSettings();
      break;
    case 'status.updated':
      if (payload.session_id === state.activeSessionId) {
        renderStatus(payload.message);
      }
      break;
    case 'runtime.exit':
      renderStatus('Hermes sidecar exited');
      break;
    case 'error':
      renderStatus(payload.message || 'Unknown error');
      break;
    default:
      break;
  }
}

function updateSession(session) {
  const idx = state.sessions.findIndex((item) => item.session_id === session.session_id);
  const next = {
    ...(state.sessions[idx] || {}),
    ...session,
  };
  if (idx >= 0) {
    state.sessions.splice(idx, 1, next);
  } else {
    state.sessions.unshift(next);
  }
  if (session.session_id === state.activeSessionId) {
    state.busy = Boolean(session.busy);
    if (Array.isArray(session.messages) && session.messages.length > 0 && !state.streamingText) {
      state.messages = normalizeMessages(session.messages);
    }
    state.workspace = session.cwd || state.workspace;
    renderWorkspace();
    renderMessages();
  }
  renderSessions();
}

function updateToolTimeline(type, payload) {
  const existing = state.tools.find((tool) => tool.id === payload.tool_name && tool.status === 'running');
  if (type === 'tool.started') {
    state.tools.unshift({
      id: payload.tool_name,
      preview: payload.preview || payload.tool_name,
      status: 'running',
      duration: null,
    });
  } else if (existing) {
    existing.status = payload.is_error ? 'error' : 'done';
    existing.duration = payload.duration || null;
  }
  renderTools();
}

function showApprovalModal(payload) {
  state.pendingApproval = payload;
  showModal(
    'Approve command',
    `${payload.description}\n\n${payload.command}`,
    payload.choices || ['once', 'session', 'always', 'deny'],
    async (choice) => {
      await window.hermesDesktop.command('approval.resolve', {
        session_id: payload.session_id,
        prompt_id: payload.prompt_id,
        choice,
      });
      hideModal();
    },
  );
}

function showClarifyModal(payload) {
  state.pendingClarify = payload;
  const choices = payload.choices && payload.choices.length > 0 ? payload.choices : ['Submit'];
  if (choices.length === 1 && choices[0] === 'Submit') {
    showPromptModal(payload);
    return;
  }
  showModal(
    'Need clarification',
    payload.question,
    choices,
    async (choice) => {
      await window.hermesDesktop.command('clarify.resolve', {
        session_id: payload.session_id,
        prompt_id: payload.prompt_id,
        answer: choice,
      });
      hideModal();
    },
  );
}

function showPromptModal(payload) {
  els.modalTitle.textContent = 'Need clarification';
  els.modalBody.textContent = payload.question;
  els.modalActions.innerHTML = '';
  const input = document.createElement('textarea');
  input.placeholder = 'Reply to Hermes...';
  input.style.minHeight = '120px';
  els.modalBody.appendChild(document.createElement('br'));
  els.modalBody.appendChild(input);
  const submit = document.createElement('button');
  submit.className = 'primary';
  submit.textContent = 'Submit';
  submit.addEventListener('click', async () => {
    await window.hermesDesktop.command('clarify.resolve', {
      session_id: payload.session_id,
      prompt_id: payload.prompt_id,
      answer: input.value,
    });
    hideModal();
  });
  els.modalActions.appendChild(submit);
  els.modalBackdrop.classList.remove('hidden');
}

function showModal(title, body, actions, onSelect) {
  els.modalTitle.textContent = title;
  els.modalBody.textContent = body;
  els.modalActions.innerHTML = '';
  for (const action of actions) {
    const button = document.createElement('button');
    button.textContent = action;
    button.className = action === 'deny' ? 'danger' : 'secondary';
    button.addEventListener('click', () => onSelect(action));
    els.modalActions.appendChild(button);
  }
  els.modalBackdrop.classList.remove('hidden');
}

function hideModal() {
  els.modalBackdrop.classList.add('hidden');
  els.modalActions.innerHTML = '';
  els.modalBody.textContent = '';
  state.pendingApproval = null;
  state.pendingClarify = null;
}

function renderWorkspace() {
  els.workspacePath.textContent = state.workspace || 'Not selected';
}

function renderStatus(text) {
  els.statusLine.textContent = text;
}

function renderSessions() {
  els.sessionsList.innerHTML = '';
  for (const session of state.sessions) {
    const item = document.createElement('button');
    item.className = `session-item${session.session_id === state.activeSessionId ? ' active' : ''}`;
    item.addEventListener('click', () => resumeSession(session.session_id));

    const title = document.createElement('div');
    title.className = 'session-title';
    title.textContent = session.title || session.preview || session.session_id.slice(0, 8);
    item.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'session-meta';
    meta.textContent = `${session.model || 'default model'} • ${session.cwd || '.'}${session.busy ? ' • running' : ''}`;
    item.appendChild(meta);
    els.sessionsList.appendChild(item);
  }
}

function renderMessages() {
  els.messages.innerHTML = '';
  const combined = [...state.messages];
  if (state.streamingText) {
    combined.push({ role: 'assistant', content: state.streamingText });
  }
  if (combined.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'message tool';
    empty.textContent = 'Start a session and ask Hermes to inspect or modify this codebase.';
    els.messages.appendChild(empty);
  }
  for (const msg of combined) {
    const el = document.createElement('div');
    el.className = `message ${msg.role}`;
    el.textContent = msg.content || '';
    els.messages.appendChild(el);
  }
  els.messages.scrollTop = els.messages.scrollHeight;
  const active = state.sessions.find((item) => item.session_id === state.activeSessionId);
  els.activeTitle.textContent = active?.title || state.activeSessionId || 'No active session';
}

function renderTools() {
  els.toolTimeline.innerHTML = '';
  for (const tool of state.tools) {
    const el = document.createElement('div');
    el.className = `tool-item ${tool.status}`;
    el.textContent = tool.duration
      ? `${tool.preview} • ${tool.status} • ${tool.duration.toFixed(1)}s`
      : `${tool.preview} • ${tool.status}`;
    els.toolTimeline.appendChild(el);
  }
}

function renderSettings() {
  if (!state.settings) {
    return;
  }
  els.modelInput.value = state.settings.model || '';
  els.toolsetsInput.value = (state.settings.toolsets || []).join(', ');
  els.approvalsSelect.value = state.settings.approvals_mode || 'manual';
  els.cwdInput.value = state.settings.cwd || '.';
}

function normalizeMessages(messages) {
  return (messages || [])
    .filter((msg) => ['user', 'assistant', 'tool'].includes(msg.role))
    .map((msg) => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
    }));
}

boot().catch((error) => {
  console.error(error);
  renderStatus(error.message);
});
