(function(){
  const token = sessionStorage.getItem('token');
  if (!token) { window.location.href='/login'; return; }

  const backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.onclick = () => { window.location.href = '/'; };
  const result = document.getElementById('result');
  const extra = document.getElementById('reportExtra');
  let lastResultData = null;
  const defSelect = document.getElementById('defSelect');
  const defParamsContainer = document.getElementById('defParamsContainer');
  const defInfo = document.getElementById('defInfo');
  const genParamsBtn = document.getElementById('genParamsBtn');
  const adhocParams = document.getElementById('adhocParams');
  const addAdhocParamBtn = document.getElementById('addAdhocParamBtn');

  async function loadDefinitions(){
    try {
      const r = await fetch('/report/definitions', { headers:{'Authorization':'Bearer '+token} });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Failed to load definitions');
      const items = (data.items||[]).filter(d=>d.active);
      defSelect.innerHTML='';
      const optEmpty = document.createElement('option');
      optEmpty.value=''; optEmpty.textContent='-- Select definition --';
      defSelect.appendChild(optEmpty);
      items.forEach(d=>{
        const opt = document.createElement('option');
        opt.value = String(d.id);
        opt.textContent = d.report_name;
        opt.dataset.storedProc = d.stored_procedure;
        opt.dataset.parameters = JSON.stringify(d.parameters||[]);
        defSelect.appendChild(opt);
      });
    } catch(e){
      defSelect.innerHTML='<option value="">(error loading)</option>';
      if (defInfo) defInfo.textContent = e.message;
    }
  }

  async function renderParams(){
    defParamsContainer.innerHTML='';
    const sel = defSelect.value;
    if (!sel) { if (defInfo) defInfo.textContent='No definition selected.'; return; }
    try {
      const r = await fetch('/report/definitions/' + encodeURIComponent(sel), { headers: { 'Authorization': 'Bearer ' + token } });
      if (!r.ok) {
        const t = await r.text();
        throw new Error(t || 'Failed to fetch definition');
      }
      const d = await r.json();
      const params = d.parameters || [];
      const sp = d.stored_procedure || '';
      if (defInfo) defInfo.textContent = 'Procedure: '+sp + (params.length? ' | Parameters: '+params.join(', ') : ' | No parameters');
      if (params.length){
        const grid = document.createElement('div');
        grid.className = 'row';
        params.forEach(p=>{
            const wrap = document.createElement('div');
            wrap.className = 'param-item';
            const lab = document.createElement('label'); lab.textContent = p;
            // create a placeholder input first; if a values list exists we'll replace it with a select
            const inp = document.createElement('input'); inp.id = 'param_'+p; inp.placeholder = p; inp.className = '';
            wrap.appendChild(lab); wrap.appendChild(inp); grid.appendChild(wrap);
            // Attempt to fetch value list for this parameter from the backend
            (async function(defId, paramName, parentWrap){
              try {
                const r = await fetch('/report/parameter-values/' + encodeURIComponent(defId) + '/' + encodeURIComponent(paramName), { headers: { 'Authorization': 'Bearer ' + token } });
                if (!r.ok) return; // leave as input
                const js = await r.json();
                if (!js.values || !Array.isArray(js.values) || js.values.length === 0) return;
                // Replace input with select
                const sel = document.createElement('select'); sel.id = 'param_'+paramName; sel.className = '';
                const emptyOpt = document.createElement('option'); emptyOpt.value=''; emptyOpt.textContent='(choose)'; sel.appendChild(emptyOpt);
                js.values.forEach(v => { const o = document.createElement('option'); o.value = v; o.textContent = v; sel.appendChild(o); });
                // remove the input if still present
                const existing = parentWrap.querySelector('#param_'+paramName);
                if (existing && existing.tagName && existing.tagName.toLowerCase() === 'input') existing.remove();
                parentWrap.appendChild(sel);
              } catch (e) {
                // ignore - keep input
              }
            })(sel, p, wrap);
        });
        defParamsContainer.appendChild(grid);
      }
      // leave adhoc params area available for additional params
      renderAdhocArea();
    } catch (e) {
      defParamsContainer.innerHTML = '<div style="color:#c00;">Error loading parameters: '+e.message+'</div>';
      if (defInfo) defInfo.textContent = 'Error loading definition.';
      renderAdhocArea();
    }
  }

  async function callDiag(){
    try {
      result.innerText = 'Checking connectivity...';
      const r = await fetch('/report/db/diag', { headers: { 'Authorization': 'Bearer ' + token } });
      const data = await r.json();
      result.innerHTML = '<pre>'+JSON.stringify(data, null, 2)+'</pre>';
      if (extra) extra.textContent='Connectivity checked.';
    } catch (e) {
      result.innerText = 'Error: ' + e.message;
      if (extra) extra.textContent='Connectivity error.';
    }
  }

  async function generateQuick(){
    try {
      const nameEl = document.getElementById('reportNameInput');
      const rn = nameEl && nameEl.value.trim() ? nameEl.value.trim() : '';
      result.innerText = 'Generating quick report...';
      if (extra) { extra.textContent = 'Collecting table statistics...'; }
      const fd = new FormData();
      if (rn) fd.append('report_name', rn);
      const r = await fetch('/report/generate', { method: 'POST', body: fd, headers: { 'Authorization': 'Bearer ' + token } });
      const data = await r.json();
      renderResult(data);
      if (!r.ok) { if (extra) extra.textContent='Failed'; return; }
      if (extra) {
        let msg = 'Quick report '+(data.report_name||'')+' generated.';
        if (data.report_log_id) msg += ' ID: '+data.report_log_id+'.';
        if (Array.isArray(data.tables)) msg += ' Tables: '+data.tables.length+'.';
        if (data.rows_total_estimate != null) msg += ' Rows total estimate: '+data.rows_total_estimate+'.';
        extra.textContent = msg;
      }
    } catch(e){
      result.innerText = 'Error: '+e.message;
      if (extra) extra.textContent='Error occurred.';
    }
  }

  async function runDefinition(){
    const sel = defSelect.value;
    if (!sel){ if (extra) extra.textContent='Select a definition first.'; return; }
    result.innerText='Running definition...';
    if (extra) extra.textContent='Executing stored procedure...';
    try {
      const fd = new FormData();
      fd.append('definition_id', sel);
      // Collect param values from defined parameters
      const opt = defSelect.querySelector('option[value="'+sel+'"]');
      const params = opt ? JSON.parse(opt.dataset.parameters||'[]') : [];
      params.forEach(p=>{
        const el = document.getElementById('param_'+p);
        if (el && el.value.trim()) fd.append('param_'+p, el.value.trim());
      });
      // Collect ad-hoc param name/value pairs
      if (adhocParams) {
        const rows = adhocParams.querySelectorAll('.adhoc-row');
        rows.forEach(r=>{
          const nameEl = r.querySelector('.adhoc-name');
          const valEl = r.querySelector('.adhoc-value');
          if (!nameEl || !valEl) return;
          const n = nameEl.value.trim();
          const v = valEl.value.trim();
          if (n) {
            fd.append('param_'+n, v);
          }
        });
      }
      const r = await fetch('/report/run', { method:'POST', body: fd, headers:{'Authorization':'Bearer '+token} });
      const data = await r.json();
      renderResult(data);
      if (!r.ok || !data.ok){
        if (extra) {
          let errMsg = data.error || 'Execution failed';
          if (errMsg && errMsg.toLowerCase().indexOf('too many arguments') !== -1) {
            errMsg += ' — this stored procedure appears to accept fewer parameters. Remove extra parameters or use parameter discovery.';
          }
          extra.textContent = 'Failed: ' + errMsg;
        }
        return;
      }
      if (extra) {
        extra.textContent = 'Definition '+(data.report_name||'')+' executed. Rows returned: '+data.rows_returned+'. Log ID: '+data.report_log_id+'.';
      }
    } catch(e){
      result.innerText='Error: '+e.message;
      if (extra) extra.textContent='Execution error.';
    }
  }

  function renderResult(data){
    if (!data) { result.innerText = 'No data'; return; }
    lastResultData = data;
    // If error object with detail, show it
    if (data.error && (!data.rows || data.rows.length === 0)) {
      result.innerHTML = '<pre>'+JSON.stringify(data, null, 2)+'</pre>';
      return;
    }
    const cols = data.columns || [];
    const rows = data.rows || [];
    if (cols.length && rows.length) {
      // build HTML table
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.marginTop = '8px';
      const thRow = document.createElement('tr');
      cols.forEach(c=>{ const th = document.createElement('th'); th.textContent = c; th.style.textAlign='left'; th.style.borderBottom='1px solid #333'; th.style.padding='6px'; thRow.appendChild(th); });
      const thead = document.createElement('thead'); thead.appendChild(thRow); table.appendChild(thead);
      const tbody = document.createElement('tbody');
      rows.forEach(r=>{
        const tr = document.createElement('tr');
        r.forEach(cell=>{
          const td = document.createElement('td'); td.textContent = cell === null ? '' : String(cell); td.style.padding='6px'; td.style.borderBottom='1px solid #222'; tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      result.innerHTML = ''; result.appendChild(table);
      return;
    }
    // Fallback: show JSON
    result.innerHTML = '<pre>'+JSON.stringify(data, null, 2)+'</pre>';
  }

  defSelect.onchange = () => { renderParams(); };
  async function populateParamsFromList(params, sourceLabel) {
    defParamsContainer.innerHTML = '';
    if (!Array.isArray(params) || params.length === 0) {
      if (defInfo) defInfo.textContent = 'No parameters ' + (sourceLabel ? ('(' + sourceLabel + ')') : '');
      return;
    }
    const grid = document.createElement('div');
    grid.className = 'row';
    const names = [];
    params.forEach(p=>{
      const pname = typeof p === 'string' ? p : (p.name || '');
      if (!pname) return;
      names.push(pname);
      const wrap = document.createElement('div'); wrap.className = 'param-item';
      const lab = document.createElement('label'); lab.textContent = pname;
      const inp = document.createElement('input'); inp.id = 'param_'+pname; inp.placeholder = pname;
      wrap.appendChild(lab); wrap.appendChild(inp); grid.appendChild(wrap);
    });
    defParamsContainer.appendChild(grid);
    // Update the option metadata so runDefinition picks up these param names
    const sel = defSelect.value;
    if (sel) {
      const opt = defSelect.querySelector('option[value="'+sel+'"]');
      if (opt) opt.dataset.parameters = JSON.stringify(names);
    }
    if (defInfo) defInfo.textContent = (sourceLabel ? (sourceLabel + ': ') : '') + 'Parameters: ' + names.join(', ');
  }

  if (genParamsBtn) genParamsBtn.onclick = async (ev) => {
    ev.preventDefault();
    const sel = defSelect.value;
    if (!sel) { if (defInfo) defInfo.textContent='Select a definition first.'; return; }
    const opt = defSelect.querySelector('option[value="'+sel+'"]');
    if (!opt) return;
    const sp = opt.dataset.storedProc || '';
    if (!sp) { if (defInfo) defInfo.textContent='Stored procedure name missing on definition.'; return; }
    try {
      const r = await fetch('/report/proc-parameters?name=' + encodeURIComponent(sp), { headers: { 'Authorization': 'Bearer ' + token } });
      if (!r.ok) {
        const t = await r.text(); throw new Error(t || 'Failed to discover parameters');
      }
      const data = await r.json();
      const params = (data.parameters || []).map(p=> p.name || '').filter(n=>n);
      await populateParamsFromList(params, 'discovered');
    } catch (e) {
      if (defInfo) defInfo.textContent = 'Parameter discovery failed: ' + e.message;
    }
  };
  // Ad-hoc param helpers
  function renderAdhocArea(){
    if (!adhocParams) return;
    // keep existing rows if present
    if (adhocParams.children.length) return;
    const note = document.createElement('div');
    note.style.fontSize='12px'; note.style.color='#888'; note.style.marginBottom='8px';
    note.textContent = 'Add custom name/value parameters to pass to the stored procedure.';
    adhocParams.appendChild(note);
  }
  function addAdhocRow(name, value){
    if (!adhocParams) return;
    const row = document.createElement('div');
    row.className = 'adhoc-row flex-row';
    const nameIn = document.createElement('input'); nameIn.placeholder='param name'; nameIn.className='adhoc-name'; nameIn.style.flex = '0 0 35%'; nameIn.value = name || '';
    const valIn = document.createElement('input'); valIn.placeholder='value'; valIn.className='adhoc-value'; valIn.style.flex = '1 1 55%'; valIn.value = value || '';
    const del = document.createElement('button'); del.textContent='✖'; del.className='btn btn-secondary'; del.onclick = (e)=>{ e.preventDefault(); adhocParams.removeChild(row); };
    row.appendChild(nameIn); row.appendChild(valIn); row.appendChild(del);
    adhocParams.appendChild(row);
  }
  if (addAdhocParamBtn) addAdhocParamBtn.onclick = (ev) => { ev.preventDefault(); addAdhocRow(); };
  // initial render of adhoc area
  renderAdhocArea();
  document.getElementById('btnDiag').onclick = callDiag;
  document.getElementById('btnGenerate').onclick = generateQuick;
  document.getElementById('btnRunDef').onclick = runDefinition;

  // Export helpers
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportExcelBtn = document.getElementById('exportExcelBtn');
  const exportTxtBtn = document.getElementById('exportTxtBtn');

  function tableToArray(){
    // If we rendered a table DOM inside result, convert it to array
    const tbl = result.querySelector('table');
    if (!tbl) return null;
    const cols = Array.from(tbl.querySelectorAll('thead th')).map(th=>th.textContent);
    const rows = Array.from(tbl.querySelectorAll('tbody tr')).map(tr=>Array.from(tr.children).map(td=>td.textContent));
    return { columns: cols, rows: rows };
  }

  function downloadBlob(content, filename, mime){
    const blob = new Blob([content], { type: mime || 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function sanitizeFilename(name){
    if (!name) return 'report';
    // remove path chars, replace spaces and special with underscore
    return name.replace(/[^a-z0-9\-_\.]/gi, '_').replace(/_+/g, '_').substring(0, 120);
  }

  function makeExportFilename(ext){
    const ts = new Date().toISOString().replace(/[:.]/g,'-');
    let base = 'report';
    if (lastResultData && lastResultData.report_name) base = lastResultData.report_name;
    else {
      const selOpt = defSelect && defSelect.selectedOptions && defSelect.selectedOptions[0];
      if (selOpt && selOpt.textContent) base = selOpt.textContent;
    }
    base = sanitizeFilename(base);
    return `${base}_${ts}.${ext}`;
  }

  function arrayToCsv(obj){
    const esc = v => (v==null? '' : String(v)).replace(/"/g,'""');
    const lines = [];
    if (obj.columns && obj.columns.length) lines.push('"' + obj.columns.map(esc).join('","') + '"');
    (obj.rows||[]).forEach(r => lines.push('"' + r.map(esc).join('","') + '"'));
    return lines.join('\r\n');
  }

  function jsonToTxt(obj){
    return JSON.stringify(obj, null, 2);
  }

  function exportCurrentAsCsv(){
    const table = tableToArray();
    const filename = makeExportFilename('csv');
    if (table) {
      const csv = arrayToCsv(table);
      downloadBlob(csv, filename, 'text/csv;charset=utf-8;');
    } else {
      const txt = result.querySelector('pre') ? result.querySelector('pre').textContent : result.textContent;
      downloadBlob(txt, filename, 'text/csv;charset=utf-8;');
    }
  }

  function exportCurrentAsExcel(){
    // Excel can open CSV; use same CSV but give .xlsx extension for convenience
    const filename = makeExportFilename('xlsx');
    const table = tableToArray();
    if (table) {
      const csv = arrayToCsv(table);
      downloadBlob(csv, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } else {
      const txt = result.querySelector('pre') ? result.querySelector('pre').textContent : result.textContent;
      downloadBlob(txt, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
  }

  function exportCurrentAsTxt(){
    const filename = makeExportFilename('txt');
    const table = tableToArray();
    if (table) {
      const lines = [];
      lines.push((table.columns||[]).join('\t'));
      (table.rows||[]).forEach(r=>lines.push(r.join('\t')));
      downloadBlob(lines.join('\r\n'), filename, 'text/plain;charset=utf-8;');
    } else {
      const txt = result.querySelector('pre') ? result.querySelector('pre').textContent : result.textContent;
      downloadBlob(txt, filename, 'text/plain;charset=utf-8;');
    }
  }

  if (exportCsvBtn) exportCsvBtn.onclick = (e) => { e.preventDefault(); exportCurrentAsCsv(); };
  if (exportExcelBtn) exportExcelBtn.onclick = (e) => { e.preventDefault(); exportCurrentAsExcel(); };
  if (exportTxtBtn) exportTxtBtn.onclick = (e) => { e.preventDefault(); exportCurrentAsTxt(); };

  loadDefinitions();
})();
