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
  leftCollapsed: false,
  rightCollapsed: false,
  selectedTranscriptItemId: null,
  selectedTranscriptItemType: null,
  inspectorMode: 'empty',
  selectedToolId: null,
  pinnedInspectorMode: null,
  activeView: 'thread',
};

const els = {
  workspaceName: document.getElementById('workspace-name'),
  workspacePath: document.getElementById('workspace-path'),
  workspaceContext: document.getElementById('workspace-context'),
  statusBanner: document.getElementById('status-banner'),
  statusLine: document.getElementById('status-line'),
  sessionMeta: document.getElementById('session-meta'),
  activeTitle: document.getElementById('active-title'),
  windowThreadTitle: document.getElementById('window-thread-title'),
  windowWorkspaceTitle: document.getElementById('window-workspace-title'),
  sessionsList: document.getElementById('sessions-list'),
  messages: document.getElementById('messages'),
  modePanel: document.getElementById('mode-panel'),
  modePanelLabel: document.getElementById('mode-panel-label'),
  modePanelTitle: document.getElementById('mode-panel-title'),
  modePanelCopy: document.getElementById('mode-panel-copy'),
  toolTimeline: document.getElementById('tool-timeline'),
  promptInput: document.getElementById('prompt-input'),
  modelInput: document.getElementById('model-input'),
  toolsetsInput: document.getElementById('toolsets-input'),
  approvalsSelect: document.getElementById('approvals-select'),
  cwdInput: document.getElementById('cwd-input'),
  modelPill: document.getElementById('model-pill'),
  toolsetPill: document.getElementById('toolset-pill'),
  providerPill: document.getElementById('provider-pill'),
  runStatePill: document.getElementById('run-state-pill'),
  footerBranch: document.getElementById('footer-branch'),
  inspectorTitle: document.getElementById('inspector-title'),
  inspectorSubtitle: document.getElementById('inspector-subtitle'),
  inspectorEmpty: document.getElementById('inspector-empty'),
  openChangesBtn: document.getElementById('open-changes-btn'),
  toolDetailPanel: document.getElementById('tool-detail-panel'),
  toolDetailTitle: document.getElementById('tool-detail-title'),
  toolDetailStatus: document.getElementById('tool-detail-status'),
  toolDetailPreview: document.getElementById('tool-detail-preview'),
  toolDetailDuration: document.getElementById('tool-detail-duration'),
  approvalPanel: document.getElementById('approval-panel'),
  approvalTitle: document.getElementById('approval-title'),
  approvalDescription: document.getElementById('approval-description'),
  approvalCommand: document.getElementById('approval-command'),
  approvalActions: document.getElementById('approval-actions'),
  clarifyPanel: document.getElementById('clarify-panel'),
  clarifyTitle: document.getElementById('clarify-title'),
  clarifyQuestion: document.getElementById('clarify-question'),
  clarifyChoiceActions: document.getElementById('clarify-choice-actions'),
  clarifyFreeformWrap: document.getElementById('clarify-freeform-wrap'),
  clarifyInput: document.getElementById('clarify-input'),
  clarifySubmitBtn: document.getElementById('clarify-submit-btn'),
  changesPanel: document.getElementById('changes-panel'),
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
  renderWorkspace();
  renderMessages();
  renderTools();
  renderInspector();
}

function bindUI() {
  document.getElementById('pick-workspace-btn').addEventListener('click', chooseWorkspace);
  document.getElementById('refresh-sessions-btn').addEventListener('click', refreshSessions);
  document.getElementById('new-session-btn').addEventListener('click', createSession);
  document.getElementById('send-btn').addEventListener('click', sendPrompt);
  document.getElementById('stop-btn').addEventListener('click', interruptRun);
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('toggle-left-btn').addEventListener('click', toggleLeftSidebar);
  document.getElementById('toggle-right-btn').addEventListener('click', toggleRightSidebar);
  els.clarifySubmitBtn.addEventListener('click', submitClarifyFromInspector);
  els.openChangesBtn.addEventListener('click', toggleChangesMode);
  document.getElementById('nav-search').addEventListener('click', () => setActiveView('search'));
  document.getElementById('nav-skills').addEventListener('click', () => setActiveView('skills'));
  document.getElementById('nav-automations').addEventListener('click', () => setActiveView('automations'));
}

async function chooseWorkspace() {
  const picked = await window.hermesDesktop.pickWorkspace();
  if (picked) {
    state.workspace = picked;
    renderWorkspace();
    renderStatus('Workspace selected');
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
  state.activeView = 'thread';
  activateSession(response);
  await refreshSessions();
}

async function resumeSession(sessionId) {
  const response = await window.hermesDesktop.command('session.resume', { session_id: sessionId });
  state.activeView = 'thread';
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
  renderInspector();
  renderStatus('Running Hermes...');
  renderRunState();
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
  state.selectedTranscriptItemId = null;
  state.selectedTranscriptItemType = null;
  state.selectedToolId = null;
  state.pinnedInspectorMode = null;
  renderWorkspace();
  renderMessages();
  renderTools();
  renderSessions();
  renderInspector();
  renderRunState();
  renderStatus(session.busy ? 'Running Hermes...' : 'Session ready');
  syncWindowHeader();
  renderActiveView();
}

function handleRuntimeEvent(message) {
  const { type, payload } = message;
  if (!payload) {
    return;
  }
  switch (type) {
    case 'ready':
      renderStatus(`Hermes sidecar ready (pid ${payload.pid})`);
      renderSettings();
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
      renderInspector();
      renderRunState();
      renderStatus(payload.interrupted ? 'Run interrupted' : 'Run completed');
      syncWindowHeader();
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
    renderInspector();
    renderRunState();
    syncWindowHeader();
  }
  renderSessions();
}

function updateToolTimeline(type, payload) {
  const existing = state.tools.find((tool) => tool.id === payload.tool_name && tool.status === 'running');
  if (type === 'tool.started') {
    state.tools.unshift({
      id: `${payload.tool_name}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      toolName: payload.tool_name,
      preview: payload.preview || payload.tool_name,
      status: 'running',
      duration: null,
      args: payload.args || null,
      resultSummary: null,
      errorSummary: null,
    });
  } else if (existing) {
    existing.status = payload.is_error ? 'error' : 'done';
    existing.duration = payload.duration || null;
    existing.resultSummary = payload.is_error ? null : `${existing.preview} completed`;
    existing.errorSummary = payload.is_error ? `${existing.preview} failed` : null;
  }
  renderTools();
  renderInspector();
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
  els.modalBody.innerHTML = '';
  const copy = document.createElement('div');
  copy.textContent = payload.question;
  els.modalBody.appendChild(copy);
  els.modalActions.innerHTML = '';
  const input = document.createElement('textarea');
  input.placeholder = 'Reply to Hermes...';
  input.style.minHeight = '120px';
  input.style.marginTop = '14px';
  els.modalBody.appendChild(input);
  const submit = document.createElement('button');
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
    button.className = action === 'deny' ? 'danger' : '';
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
  syncInspectorMode();
}

function renderWorkspace() {
  const workspaceName = basename(state.workspace) || '未选择';
  els.workspaceName.textContent = workspaceName;
  els.workspacePath.textContent = state.workspace || 'Choose a folder to anchor Hermes.';
  els.workspaceContext.textContent = workspaceName;
  els.windowWorkspaceTitle.textContent = workspaceName;
}

function renderStatus(text) {
  els.statusBanner.textContent = text;
  els.statusLine.textContent = text;
}

function renderRunState() {
  els.runStatePill.textContent = state.busy ? 'Running' : 'Idle';
  els.runStatePill.className = `state-pill ${state.busy ? 'running' : 'idle'}`;
}

function renderSessions() {
  els.sessionsList.innerHTML = '';
  if (state.sessions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'session-meta';
    empty.style.padding = '10px 12px';
    empty.textContent = 'No threads yet. Start a workspace session to begin.';
    els.sessionsList.appendChild(empty);
    return;
  }
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
    meta.textContent = `${basename(session.cwd || '.') || '.'} • ${session.model || 'default model'}${session.busy ? ' • running' : ''}`;
    item.appendChild(meta);
    els.sessionsList.appendChild(item);
  }
}

function renderMessages() {
  renderActiveView();
  if (state.activeView !== 'thread') {
    els.messages.innerHTML = '';
    return;
  }
  els.messages.innerHTML = '';
  const combined = [...state.messages];
  if (state.streamingText) {
    combined.push({ role: 'assistant', content: state.streamingText, streaming: true });
  }

  if (combined.length === 0) {
    const empty = document.createElement('section');
    empty.className = 'document-empty';
    empty.innerHTML = `
      <h2>Use Hermes like a focused coding workspace.</h2>
      <p>Start a thread, point it at a repository, and use the transcript as a planning and execution surface. Changes, file previews, and active tools will appear on the right.</p>
    `;
    els.messages.appendChild(empty);
  }

  for (const [index, msg] of combined.entries()) {
    const itemId = buildTranscriptItemId(msg, index);
    const block = document.createElement('article');
    block.className = `message ${msg.role}`;
    block.dataset.itemId = itemId;
    block.dataset.itemType = msg.role;
    if (state.selectedTranscriptItemId === itemId) {
      block.classList.add('selected');
    }
    block.addEventListener('click', () => selectTranscriptItem(itemId, msg.role));

    const label = document.createElement('div');
    label.className = 'message-label';
    label.textContent = roleLabel(msg.role);
    block.appendChild(label);

    const body = document.createElement('div');
    body.className = 'message-body';
    body.textContent = msg.content || '';
    block.appendChild(body);

    els.messages.appendChild(block);
  }

  els.messages.scrollTop = els.messages.scrollHeight;
  const active = state.sessions.find((item) => item.session_id === state.activeSessionId);
  els.activeTitle.textContent = active?.title || state.activeSessionId || 'No active session';
  els.windowThreadTitle.textContent = active?.title || state.activeSessionId || 'No active session';
  els.sessionMeta.textContent = active
    ? `${active.model || state.settings?.model || 'default model'} • ${basename(active.cwd || state.workspace || '.') || '.'}`
    : 'No session';
}

function renderTools() {
  els.toolTimeline.innerHTML = '';
  if (state.tools.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'tool-item';
    empty.textContent = 'No active tools yet.';
    els.toolTimeline.appendChild(empty);
    return;
  }
  for (const tool of state.tools) {
    const el = document.createElement('button');
    el.className = `tool-item ${tool.status}`;
    if (state.selectedToolId === tool.id) {
      el.classList.add('selected');
    }
    el.textContent = tool.duration
      ? `${tool.preview} • ${tool.status} • ${tool.duration.toFixed(1)}s`
      : `${tool.preview} • ${tool.status}`;
    el.addEventListener('click', () => selectTool(tool.id));
    els.toolTimeline.appendChild(el);
  }
}

function renderInspector() {
  syncInspectorMode();
  els.inspectorEmpty.style.display = state.inspectorMode === 'empty' ? 'flex' : 'none';
  els.toolDetailPanel.classList.toggle('hidden', state.inspectorMode !== 'tool_detail');
  els.approvalPanel.classList.toggle('hidden', state.inspectorMode !== 'approval');
  els.clarifyPanel.classList.toggle('hidden', state.inspectorMode !== 'clarify');
  els.changesPanel.classList.toggle('hidden', state.inspectorMode !== 'changes_placeholder');
  els.openChangesBtn.classList.toggle('active', state.inspectorMode === 'changes_placeholder');

  if (state.inspectorMode === 'approval') {
    els.inspectorTitle.textContent = 'Approval required';
    els.inspectorSubtitle.textContent = 'Hermes is waiting for confirmation before running a guarded command.';
    renderApprovalPanel();
    return;
  }
  if (state.inspectorMode === 'clarify') {
    els.inspectorTitle.textContent = 'Clarification required';
    els.inspectorSubtitle.textContent = 'Hermes is waiting for additional input to continue the turn.';
    renderClarifyPanel();
    return;
  }
  if (state.inspectorMode === 'transcript_selection') {
    const selectedMessage = findSelectedTranscriptMessage();
    if (selectedMessage) {
      els.inspectorTitle.textContent = selectedMessage.role === 'tool' ? 'Selected tool output' : 'Selected transcript block';
      els.inspectorSubtitle.textContent = summarizeContent(selectedMessage.content);
      return;
    }
  }
  if (state.inspectorMode === 'tool_timeline') {
    const latest = state.tools[0];
    els.inspectorTitle.textContent = latest.status === 'running' ? 'Active tool' : 'Recent tool output';
    els.inspectorSubtitle.textContent = latest.preview;
    return;
  }
  if (state.inspectorMode === 'tool_detail') {
    const selectedTool = findSelectedTool();
    if (selectedTool) {
      els.inspectorTitle.textContent = 'Tool detail';
      els.inspectorSubtitle.textContent = selectedTool.toolName || selectedTool.preview;
      els.toolDetailTitle.textContent = selectedTool.toolName || selectedTool.preview;
      els.toolDetailStatus.textContent = selectedTool.status;
      els.toolDetailPreview.textContent = selectedTool.preview || 'No preview available';
      els.toolDetailDuration.textContent = selectedTool.duration
        ? `Duration: ${selectedTool.duration.toFixed(1)}s`
        : 'Duration: in progress';
      return;
    }
  }
  if (state.inspectorMode === 'changes_placeholder') {
    els.inspectorTitle.textContent = '未暂存';
    els.inspectorSubtitle.textContent = 'This reserved inspector mode will later show changed files, diffs, and patch review states.';
    return;
  }
  els.inspectorTitle.textContent = '未暂存';
  els.inspectorSubtitle.textContent = 'Changes, files, and active tool detail appear here.';
}

function renderSettings() {
  if (!state.settings) {
    return;
  }
  els.modelInput.value = state.settings.model || '';
  els.toolsetsInput.value = (state.settings.toolsets || []).join(', ');
  els.approvalsSelect.value = state.settings.approvals_mode || 'manual';
  els.cwdInput.value = state.settings.cwd || '.';
  els.modelPill.textContent = state.settings.model || 'default model';
  els.toolsetPill.textContent = (state.settings.toolsets || []).join(', ') || 'toolsets';
  els.providerPill.textContent = state.settings.approvals_mode || 'manual';
  els.footerBranch.textContent = 'branch: main';
}

function setActiveView(view) {
  state.activeView = view;
  if (view !== 'thread') {
    state.selectedTranscriptItemId = null;
    state.selectedTranscriptItemType = null;
    state.selectedToolId = null;
    state.pinnedInspectorMode = null;
  }
  renderActiveView();
  renderMessages();
  renderInspector();
  renderNavState();
}

function renderActiveView() {
  const isThreadView = state.activeView === 'thread';
  els.modePanel.classList.toggle('hidden', isThreadView);
  els.messages.style.display = isThreadView ? 'block' : 'none';

  if (isThreadView) {
    return;
  }

  const copyByView = {
    search: {
      title: 'Search',
      copy: 'This view will surface Hermes session recall, memory-aware search, and thread lookup. Phase 2 will connect this workspace to session_search and cross-thread navigation.',
    },
    skills: {
      title: 'Skills',
      copy: 'This view will become the Skills surface for browsing installed skills, understanding their scope, and activating them inside the current thread without dropping to the CLI.',
    },
    automations: {
      title: 'Automations',
      copy: 'This view will become the operations surface for Hermes cron jobs, delivery targets, attached skills, and recent run results.',
    },
  };

  const config = copyByView[state.activeView] || {
    title: 'Workspace',
    copy: 'This workspace mode is not yet implemented.',
  };

  els.modePanelLabel.textContent = 'Workspace Mode';
  els.modePanelTitle.textContent = config.title;
  els.modePanelCopy.textContent = config.copy;
}

function renderNavState() {
  const buttons = document.querySelectorAll('.rail-top [data-view]');
  buttons.forEach((button) => {
    const isActive = button.dataset.view === state.activeView;
    button.classList.toggle('active', isActive);
  });
}

function toggleLeftSidebar() {
  state.leftCollapsed = !state.leftCollapsed;
  document.body.classList.toggle('left-collapsed', state.leftCollapsed);
}

function toggleRightSidebar() {
  state.rightCollapsed = !state.rightCollapsed;
  document.body.classList.toggle('right-collapsed', state.rightCollapsed);
}

function syncWindowHeader() {
  const active = state.sessions.find((item) => item.session_id === state.activeSessionId);
  els.windowThreadTitle.textContent = active?.title || state.activeSessionId || 'No active session';
  els.windowWorkspaceTitle.textContent = basename(active?.cwd || state.workspace || '') || 'hermes-agent';
}

function normalizeMessages(messages) {
  return (messages || [])
    .filter((msg) => ['user', 'assistant', 'tool'].includes(msg.role))
    .map((msg, index) => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''),
      itemId: msg.itemId || `${msg.role}-${index}-${hashString(typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content || ''))}`,
    }));
}

function basename(filePath) {
  if (!filePath) {
    return '';
  }
  return filePath.split(/[\\/]/).filter(Boolean).pop() || filePath;
}

function roleLabel(role) {
  if (role === 'user') return 'Prompt';
  if (role === 'assistant') return 'Hermes';
  if (role === 'tool') return 'System';
  return role;
}

function selectTranscriptItem(itemId, itemType) {
  if (state.selectedTranscriptItemId === itemId) {
    state.selectedTranscriptItemId = null;
    state.selectedTranscriptItemType = null;
  } else {
    state.selectedTranscriptItemId = itemId;
    state.selectedTranscriptItemType = itemType;
    state.selectedToolId = null;
  }
  state.pinnedInspectorMode = null;
  syncInspectorMode();
  renderMessages();
  renderInspector();
}

function selectTool(toolId) {
  if (state.selectedToolId === toolId) {
    state.selectedToolId = null;
  } else {
    state.selectedToolId = toolId;
    state.selectedTranscriptItemId = null;
    state.selectedTranscriptItemType = null;
  }
  state.pinnedInspectorMode = null;
  syncInspectorMode();
  renderTools();
  renderMessages();
  renderInspector();
}

function toggleChangesMode() {
  if (state.pinnedInspectorMode === 'changes_placeholder') {
    state.pinnedInspectorMode = null;
  } else {
    state.pinnedInspectorMode = 'changes_placeholder';
    state.selectedTranscriptItemId = null;
    state.selectedTranscriptItemType = null;
    state.selectedToolId = null;
  }
  syncInspectorMode();
  renderMessages();
  renderTools();
  renderInspector();
}

function findSelectedTranscriptMessage() {
  const combined = [...state.messages];
  if (state.streamingText) {
    combined.push({ role: 'assistant', content: state.streamingText, itemId: 'assistant-streaming' });
  }
  return combined.find((msg, index) => buildTranscriptItemId(msg, index) === state.selectedTranscriptItemId) || null;
}

function findSelectedTool() {
  return state.tools.find((tool) => tool.id === state.selectedToolId) || null;
}

function renderApprovalPanel() {
  if (!state.pendingApproval) {
    els.approvalTitle.textContent = 'Approval required';
    els.approvalDescription.textContent = 'Hermes is waiting for confirmation.';
    els.approvalCommand.textContent = '';
    els.approvalActions.innerHTML = '';
    return;
  }

  els.approvalTitle.textContent = 'Approval required';
  els.approvalDescription.textContent = state.pendingApproval.description || 'Hermes is waiting for confirmation before it can continue.';
  els.approvalCommand.textContent = state.pendingApproval.command || '';
  els.approvalActions.innerHTML = '';

  const choices = state.pendingApproval.choices || ['once', 'session', 'always', 'deny'];
  for (const choice of choices) {
    const button = document.createElement('button');
    button.className = `approval-action${choice === 'deny' ? ' deny' : ''}`;
    button.textContent = choice;
    button.addEventListener('click', async () => {
      await window.hermesDesktop.command('approval.resolve', {
        session_id: state.pendingApproval.session_id,
        prompt_id: state.pendingApproval.prompt_id,
        choice,
      });
      hideModal();
    });
    els.approvalActions.appendChild(button);
  }
}

function renderClarifyPanel() {
  if (!state.pendingClarify) {
    els.clarifyTitle.textContent = 'Clarification required';
    els.clarifyQuestion.textContent = 'Hermes is waiting for additional input.';
    els.clarifyChoiceActions.innerHTML = '';
    els.clarifyInput.value = '';
    els.clarifyFreeformWrap.classList.add('hidden');
    return;
  }

  const choices = state.pendingClarify.choices || [];
  const useFreeform = choices.length === 0 || (choices.length === 1 && choices[0] === 'Submit');

  els.clarifyTitle.textContent = 'Clarification required';
  els.clarifyQuestion.textContent = state.pendingClarify.question || 'Hermes is waiting for additional input.';
  els.clarifyChoiceActions.innerHTML = '';

  if (useFreeform) {
    els.clarifyFreeformWrap.classList.remove('hidden');
  } else {
    els.clarifyFreeformWrap.classList.add('hidden');
    for (const choice of choices) {
      const button = document.createElement('button');
      button.className = 'approval-action';
      button.textContent = choice;
      button.addEventListener('click', async () => {
        await submitClarifyAnswer(choice);
      });
      els.clarifyChoiceActions.appendChild(button);
    }
  }
}

async function submitClarifyFromInspector() {
  await submitClarifyAnswer(els.clarifyInput.value);
}

async function submitClarifyAnswer(answer) {
  if (!state.pendingClarify) {
    return;
  }
  await window.hermesDesktop.command('clarify.resolve', {
    session_id: state.pendingClarify.session_id,
    prompt_id: state.pendingClarify.prompt_id,
    answer,
  });
  hideModal();
}

function buildTranscriptItemId(msg, index) {
  if (msg.itemId) {
    return msg.itemId;
  }
  if (msg.streaming) {
    return 'assistant-streaming';
  }
  return `${msg.role}-${index}-${hashString(msg.content || '')}`;
}

function summarizeContent(content) {
  const text = String(content || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return 'Empty block';
  }
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
}

function syncInspectorMode() {
  if (state.pendingApproval) {
    state.inspectorMode = 'approval';
    return;
  }
  if (state.pendingClarify) {
    state.inspectorMode = 'clarify';
    return;
  }
  if (state.selectedToolId) {
    state.inspectorMode = 'tool_detail';
    return;
  }
  if (state.selectedTranscriptItemId) {
    state.inspectorMode = 'transcript_selection';
    return;
  }
  if (state.pinnedInspectorMode === 'changes_placeholder') {
    state.inspectorMode = 'changes_placeholder';
    return;
  }
  if (state.tools.length > 0) {
    state.inspectorMode = 'tool_timeline';
    return;
  }
  state.inspectorMode = 'empty';
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

boot().catch((error) => {
  console.error(error);
  renderStatus(error.message);
});
