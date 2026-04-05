(function(){
  function getToken() {
    return sessionStorage.getItem('token') || localStorage.getItem('token') || '';
  }

  function redirectToLogin() {
    window.location.href = '/login?next=' + encodeURIComponent('/report');
  }

  function getAuthHeaders() {
    const token = getToken();
    return token ? { 'Authorization': 'Bearer ' + token } : {};
  }

  async function authFetch(url, options) {
    const opts = options ? Object.assign({}, options) : {};
    const headers = Object.assign({}, opts.headers || {}, getAuthHeaders());
    opts.headers = headers;
    const res = await fetch(url, opts);
    if (res.status === 401) {
      try {
        sessionStorage.removeItem('token');
      } catch (_e) {}
      redirectToLogin();
    }
    return res;
  }

  if (!getToken()) { redirectToLogin(); return; }

  function navigateTo(url){
    if (typeof window.navigateWithTransition === 'function') {
      window.navigateWithTransition(url);
      return;
    }
    window.location.href = url;
  }

  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.addEventListener('click', () => { navigateTo('/'); });

  const defSelect = document.getElementById('defSelect');
  const defSearchInput = document.getElementById('defSearchInput');
  const refreshDefsBtn = document.getElementById('refreshDefsBtn');
  const defParamsContainer = document.getElementById('defParamsContainer');
  const defInfo = document.getElementById('defInfo');
  const runStateBadge = document.getElementById('runStateBadge');

  const defSummaryName = document.getElementById('defSummaryName');
  const defSummaryProc = document.getElementById('defSummaryProc');
  const defSummaryParams = document.getElementById('defSummaryParams');
  const defSummaryStatus = document.getElementById('defSummaryStatus');
  const defSummaryLastRun = document.getElementById('defSummaryLastRun');
  const definitionCountBadge = document.getElementById('definitionCountBadge');

  const actionJournal = document.getElementById('actionJournal');
  const clearJournalBtn = document.getElementById('clearJournalBtn');

  const resultSummary = document.getElementById('resultSummary');
  const resultArea = document.getElementById('result');
  const resultTableContainer = document.getElementById('resultTableContainer');
  const resultJsonContainer = document.getElementById('resultJsonContainer');
  const extra = document.getElementById('reportExtra');
  const viewTableBtn = document.getElementById('viewTableBtn');
  const viewJsonBtn = document.getElementById('viewJsonBtn');

  const exportFormatSelect = document.getElementById('exportFormatSelect');
  const exportTriggerBtn = document.getElementById('exportTriggerBtn');
  const copyJsonBtn = document.getElementById('copyJsonBtn');
  const runDefinitionBtn = document.getElementById('btnRunDef');
  const popupCards = Array.from(document.querySelectorAll('[data-popup-card]'));

  let lastResultData = null;
  let currentResultView = 'table';
  let currentDefinitionName = '';
  let currentStoredProcedure = '';
  let loadedDefinitions = [];

  function formatTimestamp(){
    const now = new Date();
    return now.toLocaleString();
  }

  function setResultStatus(message){
    if (resultArea) resultArea.textContent = message || '';
  }

  function updateResultSummary(message){
    if (resultSummary) resultSummary.textContent = message || '';
  }

  function setRunState(text, variant){
    if (!runStateBadge) return;
    runStateBadge.textContent = text || 'Idle';
    if (variant === 'running') {
      runStateBadge.style.background = 'rgba(59,130,246,0.16)';
      runStateBadge.style.color = '#1d4ed8';
      return;
    }
    if (variant === 'success') {
      runStateBadge.style.background = 'rgba(16,185,129,0.16)';
      runStateBadge.style.color = '#047857';
      return;
    }
    if (variant === 'error') {
      runStateBadge.style.background = 'rgba(239,68,68,0.16)';
      runStateBadge.style.color = '#b91c1c';
      return;
    }
    runStateBadge.style.background = '';
    runStateBadge.style.color = '';
  }

  function markViewButtons(){
    if (!viewTableBtn || !viewJsonBtn) return;
    viewTableBtn.classList.toggle('active', currentResultView === 'table');
    viewJsonBtn.classList.toggle('active', currentResultView === 'json');
  }

  function getCardTitle(card){
    if (!card || !card.dataset) return 'panel';
    if (card.dataset.cardTitle) return card.dataset.cardTitle;
    if (card.dataset.title) return card.dataset.title;
    const heading = card.querySelector('h2');
    if (heading && heading.textContent) return heading.textContent.trim();
    return 'panel';
  }

  function getPopupButton(card){
    return card ? card.querySelector('[data-popup-toggle]') : null;
  }

  function setPopupButtonState(card, open){
    const btn = getPopupButton(card);
    if (!btn) return;
    btn.textContent = open ? '×' : '+';
    btn.classList.toggle('active', !!open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    const label = (open ? 'Close ' : 'Show ') + getCardTitle(card);
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }

  let activePopup = null;

  function closeCardPopup(){
    if (!activePopup) return;
    const { overlay, card, source, parent, button } = activePopup;
    if (overlay && overlay.parentElement) overlay.parentElement.removeChild(overlay);
    if (parent) parent.appendChild(source);
    source.style.display = 'none';
    setPopupButtonState(card, false);
    if (button) {
      try {
        button.focus({ preventScroll: true });
      } catch (_err) {}
    }
    document.body.classList.remove('card-popup-open');
    activePopup = null;
  }

  function openCardPopup(card){
    if (!card) return;
    const source = card.querySelector('.card-popup-source');
    if (!source) return;
    if (activePopup) closeCardPopup();
    const overlay = document.createElement('div');
    overlay.className = 'card-popup-overlay';
    const panel = document.createElement('div');
    panel.className = 'card-popup-panel';
    const header = document.createElement('div');
    header.className = 'card-popup-header';
    const title = document.createElement('h3');
    title.textContent = getCardTitle(card);
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'card-popup-close';
    closeBtn.textContent = '×';
    const closeLabel = 'Close ' + getCardTitle(card);
    closeBtn.setAttribute('aria-label', closeLabel);
    closeBtn.title = closeLabel;
    header.appendChild(title);
    header.appendChild(closeBtn);
    const body = document.createElement('div');
    body.className = 'card-popup-body';
    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    document.body.classList.add('card-popup-open');
    const button = getPopupButton(card);
    activePopup = {
      overlay: overlay,
      card: card,
      source: source,
      parent: source.parentElement,
      button: button
    };
    setPopupButtonState(card, true);
    source.style.display = 'block';
    body.appendChild(source);
    const handleOverlayClick = (ev) => {
      if (ev.target === overlay) closeCardPopup();
    };
    overlay.addEventListener('click', handleOverlayClick);
    closeBtn.addEventListener('click', (ev) => { ev.preventDefault(); closeCardPopup(); });
    setTimeout(() => {
      try { closeBtn.focus({ preventScroll: true }); } catch (_err) {}
    }, 0);
  }

  function showResultView(mode){
    currentResultView = mode === 'json' ? 'json' : 'table';
    if (resultTableContainer) {
      if (currentResultView === 'table') resultTableContainer.classList.remove('hidden');
      else resultTableContainer.classList.add('hidden');
    }
    if (resultJsonContainer) {
      if (currentResultView === 'json') resultJsonContainer.classList.remove('hidden');
      else resultJsonContainer.classList.add('hidden');
    }
    markViewButtons();
  }

  function pushJournalEntry(message, variant){
    if (!actionJournal) return;
    const entry = document.createElement('div');
    entry.className = 'journal-entry' + (variant ? ' ' + variant : '');
    const ts = document.createElement('span');
    ts.textContent = formatTimestamp();
    const body = document.createElement('div');
    body.textContent = message;
    entry.appendChild(ts);
    entry.appendChild(body);
    actionJournal.prepend(entry);
    const maxEntries = 40;
    while (actionJournal.children.length > maxEntries) {
      actionJournal.removeChild(actionJournal.lastChild);
    }
  }

  function clearJournal(){
    if (!actionJournal) return;
    actionJournal.innerHTML = '';
  }

  function updateDefinitionCountBadge(count){
    if (!definitionCountBadge) return;
    const label = count === 1 ? 'definition' : 'definitions';
    definitionCountBadge.textContent = count + ' active ' + label;
  }

  function summarizeText(value, limit){
    if (value === null || value === undefined) return '';
    const text = String(value).trim();
    if (!text) return '';
    const max = limit || 160;
    return text.length > max ? text.slice(0, max - 1) + '...' : text;
  }

  function extractParameterNames(list){
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      if (!item) return null;
      if (typeof item === 'string') return item;
      if (typeof item === 'object') {
        return item.name || item.parameter || item.param || item.parameter_name || null;
      }
      return null;
    }).filter(Boolean);
  }

  function normalizeParameterObjects(list){
    if (!Array.isArray(list)) return [];
    return list.map(item => {
      if (!item) return null;
      if (typeof item === 'string') return { name: item };
      if (typeof item === 'object') {
        const name = item.name || item.parameter || item.param || item.parameter_name;
        if (!name) return null;
        return {
          name: name,
          type: item.type || item.data_type || '',
          mode: item.mode || item.direction || ''
        };
      }
      return null;
    }).filter(Boolean);
  }

  function applyDefinitionSnapshot(definition, params){
    if (!definition) {
      currentDefinitionName = '';
      currentStoredProcedure = '';
      if (defSummaryName) defSummaryName.textContent = 'None selected';
      if (defSummaryProc) defSummaryProc.textContent = '--';
      if (defSummaryParams) defSummaryParams.textContent = 'Waiting for selection';
      if (defSummaryStatus) defSummaryStatus.textContent = 'Idle';
      if (defSummaryLastRun) defSummaryLastRun.textContent = 'No executions yet.';
      return;
    }
    currentDefinitionName = definition.report_name || '';
    currentStoredProcedure = definition.stored_procedure || '';
    const names = extractParameterNames(params || definition.parameters || []);
    if (defSummaryName) defSummaryName.textContent = currentDefinitionName || '(untitled)';
    if (defSummaryProc) defSummaryProc.textContent = currentStoredProcedure || 'Not provided';
    if (defSummaryParams) defSummaryParams.textContent = names.length ? names.join(', ') : 'No parameters configured';
    if (defSummaryStatus) defSummaryStatus.textContent = 'Ready';
  }

  function noteLastRun(message, variant){
    if (defSummaryLastRun) defSummaryLastRun.textContent = message;
    if (defSummaryStatus) {
      if (variant === 'success') defSummaryStatus.textContent = 'Completed';
      else if (variant === 'error') defSummaryStatus.textContent = 'Failed';
      else defSummaryStatus.textContent = message;
    }
  }

  async function parseJsonSafe(response){
    const text = await response.text();
    if (!text) return { data: null, raw: '' };
    try {
      return { data: JSON.parse(text), raw: text };
    } catch (err) {
      return { data: null, raw: text };
    }
  }

  async function loadDefinitions(){
    if (!defSelect) return;
    try {
      const res = await authFetch('/report/definitions');
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.detail || 'Failed to load definitions');
      loadedDefinitions = Array.isArray(payload.items) ? payload.items.filter(item => item && item.active) : [];
      renderDefinitionOptions(defSelect.value);
      updateDefinitionCountBadge(loadedDefinitions.length);
      pushJournalEntry('Loaded ' + loadedDefinitions.length + ' active definition' + (loadedDefinitions.length === 1 ? '' : 's') + '.', 'info');
    } catch (err) {
      loadedDefinitions = [];
      updateDefinitionCountBadge(0);
      if (defSelect) {
        defSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(error loading definitions)';
        defSelect.appendChild(opt);
      }
      if (defInfo) defInfo.textContent = err.message;
      pushJournalEntry('Failed to load definitions: ' + err.message, 'error');
    }
  }

  function renderDefinitionOptions(previousSelection){
    if (!defSelect) return;
    const prev = previousSelection || defSelect.value;
    const term = defSearchInput && defSearchInput.value ? defSearchInput.value.trim().toLowerCase() : '';
    const filtered = loadedDefinitions.filter(item => {
      if (!term) return true;
      const name = (item.report_name || '').toLowerCase();
      const proc = (item.stored_procedure || '').toLowerCase();
      return name.includes(term) || proc.includes(term);
    });

    defSelect.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = filtered.length ? '-- Select definition --' : '(no definitions match search)';
    placeholder.disabled = true;
    placeholder.selected = true;
    defSelect.appendChild(placeholder);

    filtered.forEach(item => {
      const opt = document.createElement('option');
      opt.value = String(item.id);
      opt.textContent = item.report_name || ('Definition #' + String(item.id));
      opt.dataset.storedProc = item.stored_procedure || '';
      try {
        opt.dataset.parameters = JSON.stringify(extractParameterNames(item.parameters || []));
      } catch (_err) {
        opt.dataset.parameters = '[]';
      }
      defSelect.appendChild(opt);
    });

    if (prev && defSelect.querySelector('option[value="' + prev + '"]')) {
      defSelect.value = prev;
      renderParams();
    } else {
      applyDefinitionSnapshot(null, []);
      if (defParamsContainer) defParamsContainer.innerHTML = '';
      if (defInfo) {
        defInfo.textContent = term && !filtered.length
          ? 'No definitions match your search. Try a different keyword.'
          : 'No definition selected.';
      }
    }
  }

  async function populateParameterValues(defId, paramName, container){
    try {
      const res = await authFetch('/report/parameter-values/' + encodeURIComponent(defId) + '/' + encodeURIComponent(paramName));
      if (!res.ok) return;
      const payload = await res.json();
      if (!payload.values || !Array.isArray(payload.values) || payload.values.length === 0) return;
      const select = document.createElement('select');
      select.id = 'param_' + paramName;
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = '(choose)';
      select.appendChild(emptyOpt);
      payload.values.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        select.appendChild(opt);
      });
      const existing = container.querySelector('#param_' + paramName);
      if (existing) container.replaceChild(select, existing);
    } catch (err) {
      // ignore lookup failures
    }
  }

  async function renderParams(){
    if (!defSelect || !defParamsContainer) return;
    defParamsContainer.innerHTML = '';
    const selectedId = defSelect.value;
    if (!selectedId) {
      if (defInfo) defInfo.textContent = 'No definition selected.';
      applyDefinitionSnapshot(null, []);
      return;
    }
    try {
      const res = await authFetch('/report/definitions/' + encodeURIComponent(selectedId));
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Failed to fetch definition');
      }
      const detail = await res.json();
      const params = normalizeParameterObjects(detail.parameters || []);
      const procName = detail.stored_procedure || '';
      if (defInfo) {
        const names = params.map(p => p.name);
        defInfo.textContent = 'Procedure: ' + (procName || 'Not provided') + (names.length ? ' - Parameters: ' + names.join(', ') : ' - No parameters configured');
      }
      if (params.length) {
        const grid = document.createElement('div');
        grid.className = 'row';
        params.forEach(paramObj => {
          const wrap = document.createElement('div');
          wrap.className = 'param-item';
          const label = document.createElement('label');
          label.textContent = paramObj.name;
          if (paramObj.type || paramObj.mode) {
            label.title = (paramObj.mode ? paramObj.mode + ' - ' : '') + (paramObj.type || '');
          }
          const input = document.createElement('input');
          input.id = 'param_' + paramObj.name;
          input.placeholder = paramObj.name;
          wrap.appendChild(label);
          wrap.appendChild(input);
          grid.appendChild(wrap);
          populateParameterValues(selectedId, paramObj.name, wrap);
        });
        defParamsContainer.appendChild(grid);
      } else {
        const msg = document.createElement('div');
        msg.textContent = 'This definition does not declare parameters.';
        msg.className = 'hint';
        defParamsContainer.appendChild(msg);
      }
      applyDefinitionSnapshot(detail, params);
      pushJournalEntry('Loaded parameter metadata for definition #' + selectedId + '.', 'info');
    } catch (err) {
      if (defInfo) defInfo.textContent = err.message;
      pushJournalEntry('Failed to load definition #' + selectedId + ': ' + err.message, 'error');
    }
  }

  function renderResult(data){
    lastResultData = data || null;
    if (!data) {
      setResultStatus('No data returned.');
      updateResultSummary('No content to display.');
      if (resultTableContainer) resultTableContainer.innerHTML = '';
      if (resultJsonContainer) resultJsonContainer.textContent = '';
      return;
    }
    const columns = Array.isArray(data.columns) ? data.columns : [];
    const rows = Array.isArray(data.rows) ? data.rows : [];
    const rawText = typeof data.raw === 'string' ? data.raw : '';
    const trimmedRaw = rawText ? rawText.trim() : '';
    let prettyRaw = null;
    if (trimmedRaw && (trimmedRaw.startsWith('{') || trimmedRaw.startsWith('['))) {
      try {
        prettyRaw = JSON.stringify(JSON.parse(trimmedRaw), null, 2);
      } catch (_err) {
        prettyRaw = null;
      }
    }
    if (resultJsonContainer) {
      if (prettyRaw) resultJsonContainer.textContent = prettyRaw;
      else resultJsonContainer.textContent = rawText || JSON.stringify(data, null, 2);
    }
    if (resultTableContainer) resultTableContainer.innerHTML = '';
    if (columns.length && rows.length && resultTableContainer) {
      const table = document.createElement('table');
      table.className = 'result-table';
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      table.appendChild(thead);
      const tbody = document.createElement('tbody');
      rows.forEach(row => {
        const tr = document.createElement('tr');
        row.forEach(cell => {
          const td = document.createElement('td');
          td.textContent = cell === null || cell === undefined ? '' : String(cell);
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      resultTableContainer.appendChild(table);
      showResultView('table');
      setResultStatus('Rows returned: ' + rows.length);
      updateResultSummary('Table view ready. Switch to JSON for raw output.');
    } else {
      showResultView('json');
      const statusText = data.error ? summarizeText(data.error) : trimmedRaw ? summarizeText(trimmedRaw, 140) : 'Displaying raw JSON output.';
      setResultStatus(data.error ? 'Error: ' + statusText : statusText);
      updateResultSummary(data.error ? 'Execution returned an error object.' : trimmedRaw ? 'Raw text response displayed.' : 'No tabular data available.');
    }
  }

  function tableToArray(){
    if (lastResultData && Array.isArray(lastResultData.columns) && Array.isArray(lastResultData.rows)) {
      return { columns: lastResultData.columns, rows: lastResultData.rows };
    }
    const table = resultTableContainer ? resultTableContainer.querySelector('table') : null;
    if (!table) return null;
    const columns = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent);
    const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => Array.from(tr.children).map(td => td.textContent));
    return { columns: columns, rows: rows };
  }

  function downloadBlob(content, filename, mime){
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name){
    if (!name) return 'report';
    return name.replace(/[^a-z0-9\-_\.]/gi, '_').replace(/_+/g, '_').substring(0, 120);
  }

  function makeExportFilename(ext){
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    let base = 'report';
    if (lastResultData && lastResultData.report_name) base = lastResultData.report_name;
    else if (defSelect && defSelect.selectedOptions && defSelect.selectedOptions[0]) base = defSelect.selectedOptions[0].textContent || base;
    return sanitizeFilename(base) + '_' + ts + '.' + ext;
  }

  function arrayToCsv(obj){
    const escape = (value) => (value == null ? '' : String(value)).replace(/"/g, '""');
    const lines = [];
    if (obj.columns && obj.columns.length) lines.push('"' + obj.columns.map(escape).join('","') + '"');
    (obj.rows || []).forEach(row => lines.push('"' + row.map(escape).join('","') + '"'));
    return lines.join('\r\n');
  }

  function exportCurrentAsCsv(){
    const table = tableToArray();
    const filename = makeExportFilename('csv');
    if (table) downloadBlob(arrayToCsv(table), filename, 'text/csv;charset=utf-8;');
    else if (resultJsonContainer) downloadBlob(resultJsonContainer.textContent || '', filename, 'text/csv;charset=utf-8;');
  }

  function exportCurrentAsExcel(){
    const table = tableToArray();
    const filename = makeExportFilename('xlsx');
    if (table) downloadBlob(arrayToCsv(table), filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    else if (resultJsonContainer) downloadBlob(resultJsonContainer.textContent || '', filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  }

  function exportCurrentAsTxt(){
    const table = tableToArray();
    const filename = makeExportFilename('txt');
    if (table) {
      const lines = [];
      lines.push((table.columns || []).join('\t'));
      (table.rows || []).forEach(row => lines.push(row.join('\t')));
      downloadBlob(lines.join('\r\n'), filename, 'text/plain;charset=utf-8;');
    } else if (resultJsonContainer) {
      downloadBlob(resultJsonContainer.textContent || '', filename, 'text/plain;charset=utf-8;');
    }
  }

  function exportCurrent(format){
    const type = (format || '').toLowerCase();
    if (type === 'csv') {
      exportCurrentAsCsv();
      return true;
    }
    if (type === 'xlsx' || type === 'excel') {
      exportCurrentAsExcel();
      return true;
    }
    if (type === 'txt' || type === 'text') {
      exportCurrentAsTxt();
      return true;
    }
    return false;
  }

  async function runDefinition(){
    if (!defSelect) return;
    const selectedId = defSelect.value;
    if (!selectedId) {
      if (extra) extra.textContent = 'Select a definition first.';
      pushJournalEntry('Run aborted - no definition selected.', 'error');
      return;
    }
    if (runDefinitionBtn) {
      runDefinitionBtn.disabled = true;
      runDefinitionBtn.textContent = '⏳ Running...';
    }
    setRunState('Running', 'running');
    setResultStatus('Running definition...');
    updateResultSummary('Executing stored procedure...');
    if (extra) extra.textContent = 'Executing stored procedure...';
    noteLastRun('Running definition...', 'info');
    try {
      const form = new FormData();
      form.append('definition_id', selectedId);
      const option = defSelect.selectedOptions ? defSelect.selectedOptions[0] : null;
      const declaredParams = option ? JSON.parse(option.dataset.parameters || '[]') : [];
      declaredParams.forEach(name => {
        const input = document.getElementById('param_' + name);
        if (input && input.value.trim()) form.append('param_' + name, input.value.trim());
      });
      const res = await authFetch('/report/run', { method: 'POST', body: form });
      const parsed = await parseJsonSafe(res);
      let data = parsed.data && typeof parsed.data === 'object' ? parsed.data : null;
      if (!data) data = { ok: res.ok, error: res.ok ? null : 'Unexpected response format', raw: parsed.raw };
      else if (parsed.raw && typeof data === 'object' && !('raw' in data)) data.raw = parsed.raw;
      data.httpStatus = res.status;
      data.httpStatusText = res.statusText;
      renderResult(data);
      const success = res.ok && (typeof data.ok !== 'boolean' || data.ok);
      if (!success) {
        const errText = summarizeText(data.error || data.raw || data.httpStatusText || 'Execution failed');
        if (extra) extra.textContent = 'Failed: ' + errText;
        updateResultSummary('Execution failed.');
        noteLastRun('Execution failed.', 'error');
        setRunState('Failed', 'error');
        pushJournalEntry('Definition run failed: ' + errText, 'error');
        showResultView('json');
        return;
      }
      const rowsReturned = Array.isArray(data.rows) ? data.rows.length : data.rows_returned;
      const pieces = [];
      if (rowsReturned !== undefined && rowsReturned !== null) pieces.push('Rows returned: ' + rowsReturned);
      if (data.report_log_id) pieces.push('Log ID: ' + data.report_log_id);
      if (extra) extra.textContent = pieces.length ? pieces.join(' | ') : 'Execution completed successfully.';
      updateResultSummary('Execution succeeded. Review outputs below.');
      noteLastRun('Completed at ' + formatTimestamp(), 'success');
      setRunState('Completed', 'success');
      pushJournalEntry('Definition executed successfully.', 'success');
    } catch (err) {
      setResultStatus('Error: ' + err.message);
      updateResultSummary('Execution error.');
      if (extra) extra.textContent = 'Execution error.';
      noteLastRun('Execution error.', 'error');
      setRunState('Error', 'error');
      pushJournalEntry('Definition execution errored: ' + err.message, 'error');
    } finally {
      if (runDefinitionBtn) {
        runDefinitionBtn.disabled = false;
        runDefinitionBtn.textContent = '🚀 Run Definition';
      }
    }
  }

  async function copyCurrentJson(){
    const text = resultJsonContainer ? (resultJsonContainer.textContent || '').trim() : '';
    if (!text) {
      pushJournalEntry('Nothing to copy yet. Run a definition first.', 'error');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      pushJournalEntry('Copied JSON payload to clipboard.', 'success');
    } catch (err) {
      pushJournalEntry('Copy failed: ' + (err && err.message ? err.message : 'clipboard unavailable'), 'error');
    }
  }

  if (viewTableBtn) viewTableBtn.addEventListener('click', (ev) => { ev.preventDefault(); showResultView('table'); });
  if (viewJsonBtn) viewJsonBtn.addEventListener('click', (ev) => { ev.preventDefault(); showResultView('json'); });
  if (clearJournalBtn) clearJournalBtn.addEventListener('click', (ev) => { ev.preventDefault(); clearJournal(); });
  if (runDefinitionBtn) runDefinitionBtn.addEventListener('click', (ev) => { ev.preventDefault(); runDefinition(); });
  if (defSelect) defSelect.addEventListener('change', () => { renderParams(); });
  if (defSearchInput) {
    defSearchInput.addEventListener('input', () => { renderDefinitionOptions(defSelect ? defSelect.value : ''); });
  }
  if (refreshDefsBtn) {
    refreshDefsBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      loadDefinitions();
    });
  }
  if (exportTriggerBtn) exportTriggerBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    const format = exportFormatSelect ? exportFormatSelect.value : 'csv';
    if (!exportCurrent(format)) {
      pushJournalEntry('Unsupported export format selected.', 'error');
    }
  });
  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      copyCurrentJson();
    });
  }
  popupCards.forEach(card => {
    const source = card.querySelector('.card-popup-source');
    if (source) source.style.display = 'none';
    setPopupButtonState(card, false);
    const btn = getPopupButton(card);
    if (btn) {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (activePopup && activePopup.card === card) closeCardPopup();
        else openCardPopup(card);
      });
    }
  });
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && activePopup) {
      ev.preventDefault();
      closeCardPopup();
      return;
    }
    const isEnter = ev.key === 'Enter';
    const withModifier = ev.ctrlKey || ev.metaKey;
    if (isEnter && withModifier) {
      const tag = ev.target && ev.target.tagName ? ev.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'button') {
        ev.preventDefault();
        runDefinition();
      }
    }
  });

  loadDefinitions();
  showResultView('table');
  applyDefinitionSnapshot(null, []);
  setRunState('Idle', 'idle');
  updateResultSummary('No action yet.');
  setResultStatus('Awaiting execution.');
})();

