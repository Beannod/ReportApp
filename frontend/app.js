// Loads the list of report definitions into the modal
let currentDefId = null;
let currentStoredProcName = '';
let storedProcLookupTimer = null;
let storedProcLookupSeq = 0;
let storedProcModalTimer = null;
let storedProcModalSeq = 0;

const storedProcInput = document.getElementById('defStoredProc');
const storedProcOptions = document.getElementById('storedProcOptions');
const openStoredProcSearchBtn = document.getElementById('openStoredProcSearchBtn');
const storedProcSearchModal = document.getElementById('storedProcSearchModal');
const closeStoredProcSearchBtn = document.getElementById('closeStoredProcSearchBtn');
const storedProcSearchInput = document.getElementById('storedProcSearchInput');
const storedProcSearchResults = document.getElementById('storedProcSearchResults');
async function loadReportDefinitions() {
  const token = sessionStorage.getItem('token');
  const listEl = document.getElementById('defsList');
  const msg = document.getElementById('defMsg');
  if (!listEl) return;
  listEl.innerHTML = '<div style="font-size:12px; color:#666;">Loading...</div>';
  try {
    const r = await fetch('/report/definitions', { headers: { 'Authorization': 'Bearer ' + token } });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Failed to load');
    listEl.innerHTML = '';
    const items = (data.items || []).sort((a,b)=>a.report_name.localeCompare(b.report_name));
    if (!items.length) {
      listEl.innerHTML = '<div style="font-size:12px; color:#666;">No definitions yet.</div>';
    }
    items.forEach(d => {
      const btn = document.createElement('button');
      btn.textContent = d.report_name + (d.active ? '' : ' (inactive)');
      btn.style.padding='6px 8px';
      btn.style.textAlign='left';
      btn.style.border='1px solid #ccc';
      btn.style.background='#fafafa';
      btn.style.borderRadius='6px';
      btn.style.cursor='pointer';
      btn.onclick = () => {
        currentDefId = d.id;
        document.getElementById('defReportName').value = d.report_name;
        document.getElementById('defStoredProc').value = d.stored_procedure;
        document.getElementById('defParameters').value = (d.parameters||[]).map(p => (typeof p === 'string' ? p : (p.name || ''))).join(',');
        const paramsJsonEl = document.getElementById('defParametersJson'); if (paramsJsonEl) paramsJsonEl.value = JSON.stringify(d.parameters || []);
        document.getElementById('defActive').checked = !!d.active;
        msg.textContent = 'Loaded definition #' + d.id;
        // Enable Manage Access button when a definition is selected
        const mab = document.getElementById('manageAccessBtn');
        if (mab) { mab.disabled = false; mab.style.opacity = ''; }
      };
      listEl.appendChild(btn);
    });
  } catch(e){
    listEl.innerHTML = '<div style="font-size:12px; color:#c00;">'+e.message+'</div>';
  }
}

let showReportDefsBtn, reportDefsModal, newDefBtn;
document.addEventListener('DOMContentLoaded', () => {
  showReportDefsBtn = document.getElementById('showReportDefsBtn');
  reportDefsModal = document.getElementById('reportDefsModal');
  newDefBtn = document.getElementById('newDefBtn');
  const closeDefsBtn = document.getElementById('closeDefsBtn');
  const showReportDefsBtn2 = document.getElementById('showReportDefsBtn2');
  
  // Patch: open modal and load definitions
  if (showReportDefsBtn && reportDefsModal) {
    showReportDefsBtn.onclick = () => {
      reportDefsModal.style.display = 'block';
      loadReportDefinitions();
    };
  }
  // Wire the second Report Definitions button (in Admin Controls)
  if (showReportDefsBtn2 && reportDefsModal) {
    showReportDefsBtn2.onclick = () => {
      reportDefsModal.style.display = 'block';
      loadReportDefinitions();
    };
  }
  if (closeDefsBtn && reportDefsModal) {
    closeDefsBtn.onclick = () => {
      reportDefsModal.style.display = 'none';
    };
  }
  if (newDefBtn) newDefBtn.onclick = () => {
    currentDefId = null;
    document.getElementById('defReportName').value='';
    document.getElementById('defStoredProc').value='';
    document.getElementById('defParameters').value='';
    document.getElementById('defActive').checked=true;
    const paramsJsonEl = document.getElementById('defParametersJson');
    if (paramsJsonEl) paramsJsonEl.value = '[]';
    currentStoredProcName = '';
    displayProcInfo('');
    updateProcLoaderState();
    const msg = document.getElementById('defMsg');
    if (msg) msg.textContent='New definition';
    // Disable Manage Access when creating a new definition (no id yet)
    const mab = document.getElementById('manageAccessBtn');
    if (mab) { mab.disabled = true; mab.style.opacity = '0.6'; }
  };
  // Ensure current user is loaded on page load (so we perform the post-login report definitions check)
  try {
    if (typeof loadCurrentUser === 'function') loadCurrentUser();
  } catch (e) {
    console.warn('Failed to trigger loadCurrentUser on startup:', e);
  }
});
async function postJson(url, payload){
  const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}

function navigateTo(url) {
  if (typeof window.navigateWithTransition === 'function') {
    window.navigateWithTransition(url);
    return;
  }
  window.location.href = url;
}

// Show notification toast
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.style.position = 'fixed';
  notification.style.top = '20px';
  notification.style.right = '20px';
  notification.style.padding = '15px 20px';
  notification.style.borderRadius = '8px';
  notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  // Ensure notifications are displayed above modal overlays/backdrops
  notification.style.zIndex = '100000';
  // Avoid being affected by backdrop-filter / inherited blur
  notification.style.backdropFilter = 'none';
  notification.style.webkitBackdropFilter = 'none';
  notification.style.filter = 'none';
  notification.style.maxWidth = '400px';
  notification.style.fontSize = '14px';
  notification.style.fontWeight = '500';
  notification.style.animation = 'slideInRight 0.3s ease-out';
  notification.style.whiteSpace = 'pre-line';
  
  // Set colors based on type
  if (type === 'success') {
    notification.style.backgroundColor = '#d4edda';
    notification.style.color = '#155724';
    notification.style.border = '1px solid #c3e6cb';
  } else if (type === 'error') {
    notification.style.backgroundColor = '#f8d7da';
    notification.style.color = '#721c24';
    notification.style.border = '1px solid #f5c6cb';
  } else if (type === 'warning') {
    notification.style.backgroundColor = '#fff3cd';
    notification.style.color = '#856404';
    notification.style.border = '1px solid #ffeaa7';
  } else {
    notification.style.backgroundColor = '#d1ecf1';
    notification.style.color = '#0c5460';
    notification.style.border = '1px solid #bee5eb';
  }
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  // Auto remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 4000);
}

function showMain(){
  // Show the user actions section for all authenticated users
  const userActionsSection = document.getElementById('userActionsSection');
  if (userActionsSection) userActionsSection.style.display = 'block';
  
  const username = sessionStorage.getItem('username');
  const role = sessionStorage.getItem('role');
  
  const currentUser = document.getElementById('currentUser');
  if (username && currentUser) {
    currentUser.innerText = username;
  }
  
  if (role === 'admin') {
    const adminSection = document.getElementById('adminSection');
    if (adminSection) adminSection.style.display = 'block';
    loadUsers();
    loadDashboardSummary();
  }
  
  // Show admin header controls (moved Report DB Settings button) for admins
  const adminHeader = document.getElementById('adminHeaderControls');
  if (adminHeader) {
    if (role === 'admin') adminHeader.style.display = 'flex'; else adminHeader.style.display = 'none';
  }

  // Role-specific visibility for buttons outside the admin section
  try {
    const importBtn = document.getElementById('showImportBtnUser');
    if (importBtn) {
      // Keep Import visible to all users; only allow navigation for admins
      importBtn.style.display = 'inline-flex';
      importBtn.onclick = () => { if (role === 'admin') navigateTo('/import'); else showNotification('Admin access required', 'warning'); };
    }

    const reportDefsBtn = document.getElementById('showReportDefsBtn');
    if (reportDefsBtn) {
      reportDefsBtn.style.display = (role === 'admin') ? 'inline-flex' : 'none';
    }

    const addPbBtn = document.getElementById('addPowerBIReportBtn');
    if (addPbBtn) {
      addPbBtn.style.display = (role === 'admin') ? 'block' : 'none';
    }
  } catch (e) {
    console.warn('Failed to apply role-specific visibility:', e);
  }

  // Additional restrictions for non-admins: hide report generation and Power BI quick access,
  // and disable metric inline edit controls.
  try {
    const reportBtn = document.getElementById('showReportBtn');
    if (reportBtn) reportBtn.style.display = 'inline-flex';

    const pbViewBtn = document.getElementById('showPowerBIBtn');
    if (pbViewBtn) pbViewBtn.style.display = 'inline-flex';

    // Metric edit inputs and edit buttons
    const metricInputs = document.querySelectorAll('.metric-title-input');
    metricInputs.forEach(inp => {
      if (role === 'admin') {
        inp.style.display = '';
        inp.disabled = false;
      } else {
        inp.style.display = 'none';
        inp.disabled = true;
      }
    });

    const metricEditBtns = document.querySelectorAll('.metric-actions .edit-btn');
    metricEditBtns.forEach(b => { b.style.display = (role === 'admin') ? '' : 'none'; });
  } catch (e) {
    console.warn('Failed to apply additional role restrictions:', e);
  }
  
  // If forced password change is pending, open modal
  const force = sessionStorage.getItem('forceChangePassword');
  if (force === '1') {
    const modal = document.getElementById('changePwdModal');
    if (modal) modal.style.display = 'block';
  }
}

// Load current user from backend and populate sessionStorage, then render UI
async function loadCurrentUser(){
  try {
    const token = sessionStorage.getItem('token');
    if (!token) { showMain(); return; }
    const r = await fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } });
    if (!r.ok) {
      // /api/me may not exist - that's OK, keep existing session data from login
      // Only clear if we got a 401 (invalid token)
      if (r.status === 401) {
        sessionStorage.removeItem('username');
        sessionStorage.removeItem('role');
      }
      showMain();
      return;
    }
    const u = await r.json();
    if (u && u.username) sessionStorage.setItem('username', u.username);
    if (u && u.role) sessionStorage.setItem('role', u.role);
    sessionStorage.setItem('currentUserProfile', JSON.stringify(u || {}));
    // Prefetch report definitions for quick availability check right after login.
    // Store a small flag and optional cached list in sessionStorage so other UI flows can consult it.
    try {
      const defsRes = await fetch('/report/definitions', { headers: { 'Authorization': 'Bearer ' + token } });
      if (defsRes.ok) {
        const defsPayload = await defsRes.json();
        const items = Array.isArray(defsPayload.items) ? defsPayload.items.filter(it => it && it.active) : [];
        sessionStorage.setItem('reportDefsAvailable', items.length ? '1' : '0');
        try { sessionStorage.setItem('reportDefs', JSON.stringify(items)); } catch (_e) { /* ignore storage issues */ }
      } else {
        sessionStorage.setItem('reportDefsAvailable', '0');
        sessionStorage.removeItem('reportDefs');
      }
    } catch (_e) {
      // network or other error — treat as not available
      sessionStorage.setItem('reportDefsAvailable', '0');
      sessionStorage.removeItem('reportDefs');
    }
  } catch (e) {
    console.warn('Failed to load current user:', e);
  }
  showMain();
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.onclick = () => { sessionStorage.clear(); location.reload(); }

// Quick actions navigation
const goReportBtn = document.getElementById('showReportBtn');
if (goReportBtn) {
  goReportBtn.onclick = async () => {
    const token = sessionStorage.getItem('token');
    if (!token) {
      showNotification('Not authenticated — please log in before generating reports.', 'warning');
      // Redirect to login page and request return to /report after auth
      const next = encodeURIComponent('/report');
      window.location.href = '/login?next=' + next;
      return;
    }

    // Check whether the current user has any allowed report definitions.
    try {
      const res = await fetch('/report/definitions', { headers: { 'Authorization': 'Bearer ' + token } });
      if (!res.ok) {
        // If the user can't be authenticated against the API for some reason, redirect to login
        if (res.status === 401 || res.status === 403) {
          showNotification('Session expired — please sign in again.', 'warning');
          window.location.href = '/login?next=' + encodeURIComponent('/report');
          return;
        }
        // For other errors, allow navigation but show a warning
        showNotification('Unable to check report availability (server error). Trying to open reports page.', 'warning');
        navigateTo('/report');
        return;
      }
      const payload = await res.json();
      const items = Array.isArray(payload.items) ? payload.items.filter(it => it && it.active) : [];
      // If there are no definitions available for this user, show a friendly message and do not navigate.
      if (!items.length) {
        showNotification('No report definitions available for your account.', 'warning');
        return;
      }
      // Otherwise navigate to the report page
      navigateTo('/report');
    } catch (e) {
      // Network or other failure — be conservative and allow navigation so user can still attempt
      showNotification('Network error while checking reports — opening page.', 'warning');
      navigateTo('/report');
    }
  };
}

const goPowerBIBtn = document.getElementById('showPowerBIBtn');
if (goPowerBIBtn) {
  goPowerBIBtn.onclick = () => {
    navigateTo('/powerbi');
  };
}

// Legacy dashboard Run button -> redirect to new page
const legacyRunBtn = document.getElementById('runBtn');
if (legacyRunBtn) {
  legacyRunBtn.onclick = () => { navigateTo('/report'); };
}

// Admin Settings modal wiring (support legacy and new IDs)
const showSettingsBtn = document.getElementById('showAdminSettingsBtn') || document.getElementById('showSettings');
const adminSettingsModal = document.getElementById('adminSettingsModal');
const closeAdminSettingsBtn = document.getElementById('closeAdminSettingsBtn');
const saveAdminSettingsBtn = document.getElementById('saveAdminSettingsBtn');

async function loadAdminSettings(){
  try {
    const token = sessionStorage.getItem('token');
    const r = await fetch('/admin/settings', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    if (!r.ok) throw new Error(await r.text());
    const s = await r.json();
    document.getElementById('setDriver').value = s.driver || 'ODBC Driver 18 for SQL Server';
    document.getElementById('setHost').value = s.host || '';
    document.getElementById('setPort').value = s.port || 1433;
    document.getElementById('setDatabase').value = s.database || '';
    document.getElementById('setTrusted').checked = !!s.trusted;
    document.getElementById('setEncrypt').checked = !!s.encrypt;
    document.getElementById('setUsername').value = s.username || '';
    document.getElementById('setPassword').value = '';
    document.getElementById('setReportDatabase').value = s.report_database || s.reports_database || '';
    const reportsDbEl = document.getElementById('setReportsDatabase');
    if (reportsDbEl) reportsDbEl.value = s.reports_database || s.report_database || '';
    // Toggle SQL auth fields
    document.getElementById('sqlAuthRow').style.display = s.trusted ? 'none' : 'grid';
  } catch (e) {
    const msg = document.getElementById('adminSettingsMsg');
    if (msg) { msg.textContent = 'Failed to load settings: ' + e.message; msg.style.color = 'red'; }
  }
}

// Load users from backend and populate datalist + users modal
async function loadUsers(){
  const token = sessionStorage.getItem('token');
  try{
    const r = await fetch('/users', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    if (!r.ok) {
      console.warn('Failed to load users for datalist:', await r.text());
      return;
    }
    const users = await r.json();
    const datalist = document.getElementById('userOptions');
    if (datalist) {
      datalist.innerHTML = '';
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.username;
        datalist.appendChild(opt);
      });
    }

    // If users modal is open or present, render a simple list
    const usersListEl = document.getElementById('usersList');
    if (usersListEl) {
      usersListEl.innerHTML = '';
      if (!users.length) {
        usersListEl.innerHTML = '<div style="color:#666; padding:12px;">No users found.</div>';
      } else {
        users.forEach(u => {
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.justifyContent = 'space-between';
          row.style.padding = '8px 6px';
          row.style.borderBottom = '1px solid #f0f0f5';
          const left = document.createElement('div');
          left.innerHTML = `<strong style=\"font-size:14px;\">${u.username}</strong><div style=\"font-size:12px;color:#666;\">${u.role} • ${u.created_at||''}</div>`;
          const right = document.createElement('div');
          const editBtn = document.createElement('button'); editBtn.textContent = 'Edit'; editBtn.className = 'btn-secondary'; editBtn.style.marginRight='8px';
          editBtn.onclick = () => { openEditUser(u); };
          const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.className = 'btn-secondary';
          delBtn.onclick = () => { if (confirm('Delete user ' + u.username + '?')) deleteUser(u.id); };
          right.appendChild(editBtn); right.appendChild(delBtn);
          row.appendChild(left); row.appendChild(right);
          usersListEl.appendChild(row);
        });
      }
    }
  }catch(e){
    console.warn('Error loading users for datalist:', e);
  }
}

// Helper to open Edit User modal with data
function openEditUser(u){
  const modal = document.getElementById('editUserModal');
  if (!modal) return;
  document.getElementById('editUserId').value = u.id;
  document.getElementById('editUsername').value = u.username;
  document.getElementById('editUserRole').value = u.role || 'user';
  document.getElementById('editPassword').value = '';
  modal.style.display = 'block';
}

async function deleteUser(id){
  const token = sessionStorage.getItem('token');
  try{
    const r = await fetch('/users/' + id, { method: 'DELETE', headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    if (!r.ok) throw new Error(await r.text());
    showNotification('User deleted', 'success');
    loadUsers();
  }catch(e){ showNotification('Delete failed: '+e.message,'error'); }
}

if (showSettingsBtn && adminSettingsModal) {
  showSettingsBtn.onclick = () => { adminSettingsModal.style.display = 'block'; loadAdminSettings(); loadDatabaseOptions(); loadDriverOptions(); };
}
if (closeAdminSettingsBtn && adminSettingsModal) {
  closeAdminSettingsBtn.onclick = () => { adminSettingsModal.style.display = 'none'; };
}
// Close on outside click
if (adminSettingsModal) {
  window.addEventListener('click', (ev) => { if (ev.target === adminSettingsModal) adminSettingsModal.style.display = 'none'; });
}

// Toggle SQL auth vs Windows auth
const setTrusted = document.getElementById('setTrusted');
if (setTrusted) {
  setTrusted.onchange = () => {
    const row = document.getElementById('sqlAuthRow');
    if (row) row.style.display = setTrusted.checked ? 'none' : 'grid';
  };
}

async function saveAdminSettings(){
  // Update both definitions DB and runtime reports DB from Admin panel
  const payload = {
    report_database: document.getElementById('setReportDatabase').value || undefined,
    reports_database: (document.getElementById('setReportsDatabase') ? document.getElementById('setReportsDatabase').value : undefined) || undefined
  };
  try {
    const token = sessionStorage.getItem('token');
    const r = await fetch('/admin/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) }, body: JSON.stringify(payload) });
    const msgEl = document.getElementById('adminSettingsMsg');
    if (!r.ok) { const t = await r.text(); msgEl.textContent = 'Save failed: ' + t; msgEl.style.color = 'red'; return; }
    msgEl.textContent = '✓ Report settings saved. Definitions and runtime DBs updated.'; msgEl.style.color = 'green';
  } catch (e) {
    const msgEl = document.getElementById('adminSettingsMsg');
    msgEl.textContent = 'Error: ' + e.message; msgEl.style.color = 'red';
  }
}

if (saveAdminSettingsBtn) { saveAdminSettingsBtn.onclick = saveAdminSettings; }

// Test report DB connectivity using /report/db/diag
const testReportDbBtn = document.getElementById('testReportDbBtn');
if (testReportDbBtn) {
  testReportDbBtn.onclick = async () => {
    const status = document.getElementById('reportDbStatus');
    const dbInput = document.getElementById('setReportDatabase');
    const dbName = dbInput && dbInput.value ? dbInput.value.trim() : '';
    status.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px;">⏳ Testing connection...</span>';
    status.style.background = '#fff7ed';
    status.style.border = '1px solid #fed7aa';
    status.style.color = '#9a3412';
    try {
      const token = sessionStorage.getItem('token');
      const url = '/report/db/diag' + (dbName ? `?db=${encodeURIComponent(dbName)}` : '');
      const r = await fetch(url, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
      const data = await r.json();
      if (r.ok) {
        const requested = data.override || dbName || data.using_database;
        status.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px;">✅ <strong>Connected!</strong></span>` +
          `<br><span style=\"font-size: 12px;\">Database: <strong>${data.using_database || '(unknown)'}</strong> • Tables: <strong>${data.tables_count}</strong></span>` +
          (requested && data.using_database !== requested ? `<br><span style=\"font-size: 12px; color: #0f172a;\">(Checked value: ${requested})</span>` : '');
        status.style.background = '#f0fdf4';
        status.style.border = '1px solid #86efac';
        status.style.color = '#166534';
      } else {
        let msg = `<span style="display: inline-flex; align-items: center; gap: 6px;">❌ <strong>Connection Failed</strong></span><br><span style="font-size: 12px;">${data.detail || JSON.stringify(data)}`;
        if (data.available_databases && Array.isArray(data.available_databases)) {
          msg += `<br>Available DBs: ${data.available_databases.join(', ')}`;
        }
        msg += '</span>';
        status.innerHTML = msg;
        status.style.background = '#fef2f2';
        status.style.border = '1px solid #fecaca';
        status.style.color = '#991b1b';
      }
    } catch (e) {
      status.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px;">❌ <strong>Error</strong></span><br><span style="font-size: 12px;">${e.message}</span>`;
      status.style.background = '#fef2f2';
      status.style.border = '1px solid #fecaca';
      status.style.color = '#991b1b';
    }
  };
}

// Test runtime DB connectivity using /report/db/diag/runtime
const testRuntimeDbBtn = document.getElementById('testRuntimeDbBtn');
if (testRuntimeDbBtn) {
  testRuntimeDbBtn.onclick = async () => {
    const status = document.getElementById('runtimeDbStatus');
    const runtimeInput = document.getElementById('setReportsDatabase');
    const runtimeName = runtimeInput && runtimeInput.value ? runtimeInput.value.trim() : '';
    status.innerHTML = '<span style="display: inline-flex; align-items: center; gap: 6px;">⏳ Testing connection...</span>';
    status.style.background = '#fff7ed';
    status.style.border = '1px solid #fed7aa';
    status.style.color = '#9a3412';
    try {
      const token = sessionStorage.getItem('token');
      const url = '/report/db/diag/runtime' + (runtimeName ? `?db=${encodeURIComponent(runtimeName)}` : '');
      const r = await fetch(url, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
      const data = await r.json();
      if (r.ok) {
        const requested = data.override || runtimeName || data.using_database;
        status.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px;">✅ <strong>Connected!</strong></span>` +
          `<br><span style=\"font-size: 12px;\">Database: <strong>${data.using_database || '(unknown)'}</strong> • Tables: <strong>${data.tables_count}</strong></span>` +
          (requested && data.using_database !== requested ? `<br><span style=\"font-size: 12px; color: #0f172a;\">(Checked value: ${requested})</span>` : '');
        status.style.background = '#f0fdf4';
        status.style.border = '1px solid #86efac';
        status.style.color = '#166534';
      } else {
        let msg = `<span style="display: inline-flex; align-items: center; gap: 6px;">❌ <strong>Connection Failed</strong></span><br><span style="font-size: 12px;">${data.detail || JSON.stringify(data)}`;
        if (data.available_databases && Array.isArray(data.available_databases)) {
          msg += `<br>Available DBs: ${data.available_databases.join(', ')}`;
        }
        msg += '</span>';
        status.innerHTML = msg;
        status.style.background = '#fef2f2';
        status.style.border = '1px solid #fecaca';
        status.style.color = '#991b1b';
      }
    } catch (e) {
      status.innerHTML = `<span style="display: inline-flex; align-items: center; gap: 6px;">❌ <strong>Error</strong></span><br><span style="font-size: 12px;">${e.message}</span>`;
      status.style.background = '#fef2f2';
      status.style.border = '1px solid #fecaca';
      status.style.color = '#991b1b';
    }
  };
}

// Load database names into datalist
const loadDatabasesBtn = document.getElementById('loadDatabasesBtn');
async function loadDatabaseOptions(){
  const list = document.getElementById('dbOptions');
  if (!list) return;
  list.innerHTML = '';
  try {
    const token = sessionStorage.getItem('token');
    const r = await fetch('/admin/databases', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    const data = await r.json();
    if (r.ok && data.databases) {
      data.databases.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        list.appendChild(opt);
      });
    }
  } catch (e) {
    // silently ignore in UI; user can still type
    console.warn('Failed to load database list:', e);
  }
}
if (loadDatabasesBtn) { loadDatabasesBtn.onclick = loadDatabaseOptions; }

// Load ODBC drivers into datalist
const loadDriversBtn = document.getElementById('loadDriversBtn');
async function loadDriverOptions(){
  const list = document.getElementById('driverOptions');
  if (!list) return;
  list.innerHTML = '';
  try {
    const token = sessionStorage.getItem('token');
    const r = await fetch('/admin/odbc-drivers', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    const data = await r.json();
    if (r.ok && data.drivers) {
      data.drivers.forEach(name => {
        const opt = document.createElement('option');
        opt.value = name;
        list.appendChild(opt);
      });
    }
  } catch (e) {
    console.warn('Failed to load ODBC drivers:', e);
  }
}
if (loadDriversBtn) { loadDriversBtn.onclick = loadDriverOptions; }

// Dashboard helpers: avatar initial and metric animations
function animateCount(el, to, duration = 900) {
  if (!el) return;
  const start = 0;
  const range = to - start;
  const minTimer = 50;
  const stepTime = Math.max(Math.floor(duration / Math.abs(range || 1)), minTimer);
  let current = start;
  const step = Math.ceil(range / (duration / stepTime));
  const timer = setInterval(() => {
    current += step;
    if ((step > 0 && current >= to) || (step < 0 && current <= to)) {
      el.textContent = String(to);
      clearInterval(timer);
    } else {
      el.textContent = String(current);
    }
  }, stepTime);
}

async function loadDashboardSummary() {
  const targets = {
    users: document.getElementById('summaryUsers'),
    imports: document.getElementById('summaryImports'),
    reports: document.getElementById('summaryReports'),
    tables: document.getElementById('summaryTables')
  };

  // Try common endpoints, fall back to placeholder values
  const endpoints = ['/dashboard/summary', '/api/summary', '/summary'];
  let data = null;
  for (const ep of endpoints) {
    try {
      const r = await fetch(ep);
      if (!r.ok) continue;
      data = await r.json();
      break;
    } catch (e) {
      // ignore and try next
    }
  }

  if (!data) {
    // Use existing DOM values or placeholders
    const fallback = { users: 12, imports: 34, reports: 5, tables: 8 };
    animateCount(targets.users, parseInt(targets.users?.textContent || fallback.users));
    animateCount(targets.imports, parseInt(targets.imports?.textContent || fallback.imports));
    animateCount(targets.reports, parseInt(targets.reports?.textContent || fallback.reports));
    animateCount(targets.tables, parseInt(targets.tables?.textContent || fallback.tables));
    return;
  }

  // Map expected fields
  animateCount(targets.users, parseInt(data.users || data.total_users || 0));
  animateCount(targets.imports, parseInt(data.imports || data.total_imports || 0));
  animateCount(targets.reports, parseInt(data.reports || data.total_reports || 0));
  animateCount(targets.tables, parseInt(data.tables || data.total_tables || 0));
}

// Populate avatar initial from currentUser and trigger summary load on page show
window.addEventListener('DOMContentLoaded', () => {
  // Wire visible dropdown buttons (fallback for datalist)
  document.querySelectorAll('.userDropdownBtn').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const target = btn.getAttribute('data-target');
      showUserDropdown(target, btn);
    });
  });

  // Close dropdown on Escape key
  window.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') hideUserDropdown();
  });

  const currentUserEl = document.getElementById('currentUser');
  const initialEl = document.getElementById('currentInitial');
  if (currentUserEl && initialEl) {
    const name = (currentUserEl.textContent || sessionStorage.getItem('username') || '').trim();
    const ch = name ? name.charAt(0).toUpperCase() : 'A';
    initialEl.textContent = ch;
  }

  // If admin, trigger summary load (showMain already calls loadDashboardSummary(), but ensure availability)
  try { if (typeof loadDashboardSummary === 'function') loadDashboardSummary(); } catch (e) { console.warn('Summary load failed', e); }
});



// Quick search wiring for #globalSearch
function debounce(fn, delay) {
  let t;
  return function(...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), delay); };
}

async function quickSearchQuery(q) {
  if (!q || q.trim().length < 2) return null;
  try {
    const token = sessionStorage.getItem('token');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    const r = await fetch('/api/search?q=' + encodeURIComponent(q), { headers });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    return null;
  }
}

function renderSearchResults(container, data) {
  container.innerHTML = '';
  if (!data || (!Array.isArray(data.results) && !Array.isArray(data))) {
    const no = document.createElement('div'); no.className = 'no-results'; no.textContent = 'No results'; container.appendChild(no); return;
  }
  const items = Array.isArray(data.results) ? data.results : data;
  items.slice(0,8).forEach(it => {
    const el = document.createElement('div'); el.className = 'item';
    const title = it.title || it.name || it.label || it.display || (typeof it === 'string' ? it : JSON.stringify(it));
    el.textContent = title;
    el.onclick = () => {
      if (it.url) { window.location.href = it.url; return; }
      if (it.id && it.type) { window.location.href = `/${it.type}/${it.id}`; return; }
      // fallback: put query into search box
      const gs = document.getElementById('globalSearch'); if (gs) gs.value = title;
    };
    container.appendChild(el);
  });
}

// Attach input wiring
window.addEventListener('DOMContentLoaded', () => {
  const gs = document.getElementById('globalSearch');
  if (!gs) return;
  // create container
  const wrap = document.createElement('div'); wrap.style.position = 'relative'; gs.parentNode.insertBefore(wrap, gs); wrap.appendChild(gs);
  const results = document.createElement('div'); results.className = 'search-results'; results.style.display = 'none'; wrap.appendChild(results);

  const onInput = debounce(async (ev) => {
    const q = gs.value.trim();
    if (!q || q.length < 2) { results.style.display = 'none'; return; }
    results.style.display = 'block'; results.innerHTML = '<div class="no-results">Searching…</div>';
    const data = await quickSearchQuery(q);
    renderSearchResults(results, data || []);
  }, 300);

  gs.addEventListener('input', onInput);
  document.addEventListener('click', (ev) => { if (!wrap.contains(ev.target)) results.style.display = 'none'; });
});

// Metric actions: view details and inline rename
window.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.metric-actions .view-btn').forEach(btn => {
    btn.onclick = async () => {
      const t = btn.getAttribute('data-target');
      try { await showMetricDetails(t); } catch(e) { showNotification('Failed to load details: ' + e.message, 'error'); }
    };
  });

  document.querySelectorAll('.metric-actions .edit-btn').forEach(btn => {
    btn.onclick = () => {
      const target = btn.getAttribute('data-target');
      const labelEl = document.querySelector(`.metric-label[data-key="${target}"]`);
      const inputEl = document.querySelector(`.metric-title-input[data-key="${target}"]`);
      if (!labelEl || !inputEl) return;
      if (inputEl.style.display === 'block') {
        // save
        const v = inputEl.value.trim() || labelEl.textContent;
        labelEl.textContent = v;
        inputEl.style.display = 'none';
        saveUserMetricTitles();
      } else {
        inputEl.value = labelEl.textContent;
        inputEl.style.display = 'block';
        inputEl.focus();
        inputEl.onkeydown = (e) => { if (e.key === 'Enter') { btn.click(); } };
      }
    };
  });
});

// Show metric details in modal by calling backend endpoint
async function showMetricDetails(metric) {
  const modal = document.getElementById('metricDetailModal');
  const titleEl = document.getElementById('metricDetailTitle');
  const msgEl = document.getElementById('metricDetailMsg');
  const contentEl = document.getElementById('metricDetailContent');
  if (!modal || !titleEl || !msgEl || !contentEl) return;
  titleEl.textContent = metric.charAt(0).toUpperCase() + metric.slice(1) + ' - Details';
  msgEl.textContent = 'Loading...';
  contentEl.innerHTML = '';
  modal.style.display = 'block';
  try {
    const token = sessionStorage.getItem('token');
    const headers = token ? { 'Authorization': 'Bearer ' + token } : {};
    // pagination state
    let currentOffset = 0;
    const pageLimit = 20;

    async function loadPage(offset) {
      msgEl.textContent = 'Loading...';
      contentEl.innerHTML = '';
      try {
        const r = await fetch(`/api/summary/details/${encodeURIComponent(metric)}?offset=${offset}&limit=${pageLimit}`, { headers });
        if (r.status === 403) {
          msgEl.textContent = 'You do not have permission to view these details.';
          return null;
        }
        if (!r.ok) {
          const txt = await r.text();
          msgEl.textContent = 'Error: ' + txt;
          return null;
        }
        const data = await r.json();
        msgEl.textContent = '';
        return data;
      } catch (err) {
        msgEl.textContent = 'Failed to load details: ' + (err.message || err);
        return null;
      }
    }

    function renderTable(data, append = false) {
      if (!data || !data.items) {
        contentEl.innerHTML = '<div style="padding:12px; color:#666;">No items found</div>';
        return;
      }
      // create table if not exists
      let table = contentEl.querySelector('table');
      if (!table || !append) {
        contentEl.innerHTML = '';
        table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.marginTop = '8px';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        headRow.style.textAlign = 'left';
        headRow.style.borderBottom = '1px solid #e6e6f0';
        const headers = (metric === 'users') ? ['Username','Role','Created At','Actions'] :
                        (metric === 'imports') ? ['File','Imported At','Status','Actions'] :
                        (metric === 'reports') ? ['Report','Updated At','Actions'] :
                        (metric === 'tables') ? ['Schema','Table','Actions'] : ['Item','Actions'];
        headers.forEach(h => { const th = document.createElement('th'); th.style.padding='8px'; th.textContent = h; headRow.appendChild(th); });
        thead.appendChild(headRow);
        table.appendChild(thead);
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        contentEl.appendChild(table);
      }
      const tbody = table.querySelector('tbody');
      data.items.forEach(it => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #f1f1f6';
        if (metric === 'users') {
          const role = it.role || (it.role === undefined ? '-' : it.role);
          tr.innerHTML = `<td style="padding:8px">${escapeHtml(it.username||'')}</td>` +
                         `<td style="padding:8px">${escapeHtml(role)}</td>` +
                         `<td style="padding:8px">${escapeHtml(it.created_at||'')}</td>` +
                         `<td style="padding:8px"></td>`;
          if (it.id) {
            const btn = document.createElement('button'); btn.className = 'btn-secondary'; btn.textContent = 'Open'; btn.onclick = () => { window.location.href = `/users/${it.id}`; };
            tr.children[3].appendChild(btn);
          }
        } else if (metric === 'imports') {
          tr.innerHTML = `<td style="padding:8px">${escapeHtml(it.file||'')}</td>` +
                         `<td style="padding:8px">${escapeHtml(it.imported_at||'')}</td>` +
                         `<td style="padding:8px">${escapeHtml(it.status||'')}</td>` +
                         `<td style="padding:8px"></td>`;
          if (it.id) { const btn = document.createElement('button'); btn.className='btn-secondary'; btn.textContent='Open'; btn.onclick = () => { window.location.href = `/imports/${it.id}`; }; tr.children[3].appendChild(btn); }
        } else if (metric === 'reports') {
          tr.innerHTML = `<td style="padding:8px">${escapeHtml(it.report_name||'')}</td>` +
                         `<td style="padding:8px">${escapeHtml(it.updated_at||'')}</td>` +
                         `<td style="padding:8px"></td>`;
          if (it.id) { const btn = document.createElement('button'); btn.className='btn-secondary'; btn.textContent='Open'; btn.onclick = () => { window.location.href = `/report/definitions/${it.id}`; }; tr.children[2].appendChild(btn); }
        } else if (metric === 'tables') {
          tr.innerHTML = `<td style="padding:8px">${escapeHtml(it.schema||'')}</td>` +
                         `<td style="padding:8px">${escapeHtml(it.table||'')}</td>` +
                         `<td style="padding:8px"></td>`;
          const btn = document.createElement('button'); btn.className='btn-secondary'; btn.textContent='Open'; btn.onclick = () => { window.location.href = `/tables?name=${encodeURIComponent(it.table||'')}`; }; tr.children[2].appendChild(btn);
        }
        tbody.appendChild(tr);
      });

      // pager
      let pager = contentEl.querySelector('.detail-pager');
      if (!pager) {
        pager = document.createElement('div'); pager.className = 'detail-pager'; pager.style.display='flex'; pager.style.justifyContent='center'; pager.style.marginTop='12px'; pager.style.gap='8px';
        const loadMore = document.createElement('button'); loadMore.textContent = 'Load more'; loadMore.className = 'btn-primary';
        loadMore.onclick = async () => {
          currentOffset += pageLimit;
          const more = await loadPage(currentOffset);
          if (!more || !more.items || !more.items.length) { loadMore.disabled = true; loadMore.textContent = 'No more'; return; }
          renderTable(more, true);
          if (more.total !== undefined && currentOffset + pageLimit >= more.total) { loadMore.disabled = true; loadMore.textContent = 'No more'; }
        };
        pager.appendChild(loadMore);
        contentEl.appendChild(pager);
      }
      // disable load more if at end
      if (data.total !== undefined) {
        const loadBtn = contentEl.querySelector('.detail-pager button');
        if (loadBtn) {
          if (currentOffset + pageLimit >= data.total) { loadBtn.disabled = true; loadBtn.textContent = 'No more'; }
          else { loadBtn.disabled = false; loadBtn.textContent = 'Load more'; }
        }
      }
    }

    // initial load
    const first = await loadPage(currentOffset);
    if (first) renderTable(first, false);
  } catch (e) {
    msgEl.textContent = 'Failed to load details: ' + e.message;
  }
}

// Close modal wiring
window.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('closeMetricDetailBtn');
  const modal = document.getElementById('metricDetailModal');
  if (closeBtn && modal) closeBtn.onclick = () => { modal.style.display = 'none'; };
  // close if clicked outside
  if (modal) window.addEventListener('click', (ev) => { if (ev.target === modal) modal.style.display = 'none'; });
});

// Simple HTML escaper
function escapeHtml(s) { if (s === null || s === undefined) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Persist metric titles per-user
async function saveUserMetricTitles() {
  const labels = document.querySelectorAll('.metric-label[data-key]');
  const payload = {};
  labels.forEach(l => { const k = l.getAttribute('data-key'); payload[k] = l.textContent; });
  try {
    await fetch('/api/user-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ metric_titles: payload }) });
  } catch (e) {
    console.warn('Failed to save metric titles', e);
  }
}

// --- Definition Access (Admin) UI ---
let defAccessModal, manageAccessBtn, accessListEl, accessAddBtn, accessSaveBtn;
let accessRows = [];

async function loadDefinitionAccess(defId) {
  accessRows = [];
  accessListEl = document.getElementById('accessList');
  const msg = document.getElementById('accessMsg');
  if (!defId) { if (accessListEl) accessListEl.innerHTML = '<div style="color:#666">Select a definition first.</div>'; return; }
  if (accessListEl) accessListEl.innerHTML = '<div style="color:#666">Loading access rules...</div>';
  try {
    const token = sessionStorage.getItem('token');
    const r = await fetch(`/report/definitions/${defId}/access`, { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    if (!r.ok) {
      const txt = await r.text();
      if (accessListEl) accessListEl.innerHTML = `<div style="color:#c00">Failed to load: ${txt}</div>`;
      if (msg) msg.textContent = '';
      return;
    }
    const data = await r.json();
    accessRows = data.items || data.access || data || [];
    renderAccessList();
    if (msg) msg.textContent = '';
  } catch (e) {
    if (accessListEl) accessListEl.innerHTML = `<div style="color:#c00">Error: ${e.message}</div>`;
    if (msg) msg.textContent = '';
  }
}

function renderAccessList() {
  accessListEl = document.getElementById('accessList');
  if (!accessListEl) return;
  accessListEl.innerHTML = '';
  if (!accessRows || !accessRows.length) {
    accessListEl.innerHTML = '<div style="color:#666; font-size:13px;">No access rows defined. Add one above to restrict or allow access.</div>';
    return;
  }
  accessRows.forEach((r, idx) => {
    const row = document.createElement('div');
    row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.gap = '8px'; row.style.padding = '8px'; row.style.borderBottom = '1px solid #eee';
    const badge = document.createElement('div'); badge.style.minWidth='72px'; badge.style.fontWeight='600'; badge.textContent = (r.principal_type || r.type || 'user').toUpperCase();
    const princ = document.createElement('div'); princ.style.flex='1'; princ.textContent = r.principal || r.username || r.role || '';
    const allowed = document.createElement('div'); allowed.style.width='80px'; allowed.textContent = (r.allowed === false || r.allowed === 0) ? 'DENY' : 'ALLOW'; allowed.style.color = (r.allowed === false || r.allowed === 0) ? '#b91c1c' : '#065f46'; allowed.style.fontWeight='700';
    const removeBtn = document.createElement('button'); removeBtn.className='btn-secondary'; removeBtn.textContent='Remove'; removeBtn.onclick = () => { accessRows.splice(idx,1); renderAccessList(); };
    row.appendChild(badge); row.appendChild(princ); row.appendChild(allowed); row.appendChild(removeBtn);
    accessListEl.appendChild(row);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  manageAccessBtn = document.getElementById('manageAccessBtn');
  defAccessModal = document.getElementById('defAccessModal');
  accessListEl = document.getElementById('accessList');
  accessAddBtn = document.getElementById('accessAddBtn');
  accessSaveBtn = document.getElementById('accessSaveBtn');
  const accessCancelBtn = document.getElementById('accessCancelBtn');
  const closeDefAccessBtn = document.getElementById('closeDefAccessBtn');

  if (manageAccessBtn) {
    manageAccessBtn.onclick = () => {
      if (!currentDefId) { showNotification('Open or select a definition first', 'warning'); return; }
      defAccessModal.style.display = 'block';
      loadDefinitionAccess(currentDefId);
    };
  }

  if (accessAddBtn) {
    accessAddBtn.onclick = () => {
      const t = document.getElementById('accessAddType').value || 'user';
      const p = (document.getElementById('accessAddPrincipal').value || '').trim();
      const a = !!document.getElementById('accessAddAllowed').checked;
      if (!p) { showNotification('Provide a username or role name to add', 'warning'); return; }
      accessRows.push({ principal_type: t, principal: p, allowed: a });
      document.getElementById('accessAddPrincipal').value = '';
      renderAccessList();
    };
  }

  if (accessSaveBtn) {
    accessSaveBtn.onclick = async () => {
      const msg = document.getElementById('accessMsg');
      if (!currentDefId) { showNotification('No definition selected', 'error'); return; }
      msg.textContent = 'Saving...';
      try {
        const token = sessionStorage.getItem('token');
        const payload = { access: accessRows.map(r => ({ principal_type: r.principal_type || r.type || 'user', principal: r.principal, allowed: !!r.allowed })) };
        const r = await fetch(`/report/definitions/${currentDefId}/access`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) }, body: JSON.stringify(payload) });
        if (!r.ok) { const t = await r.text(); msg.textContent = 'Save failed: ' + t; msg.style.color = 'red'; return; }
        msg.textContent = 'Saved.'; msg.style.color = 'green';
        setTimeout(() => { if (defAccessModal) defAccessModal.style.display = 'none'; msg.textContent = ''; }, 800);
      } catch (e) {
        msg.textContent = 'Error: ' + e.message; msg.style.color = 'red';
      }
    };
  }

  if (accessCancelBtn) accessCancelBtn.onclick = () => { if (defAccessModal) defAccessModal.style.display = 'none'; };
  if (closeDefAccessBtn) closeDefAccessBtn.onclick = () => { if (defAccessModal) defAccessModal.style.display = 'none'; };
  if (defAccessModal) window.addEventListener('click', (ev) => { if (ev.target === defAccessModal) defAccessModal.style.display = 'none'; });
});

async function loadUserMetricTitles() {
  try {
    const r = await fetch('/api/user-settings');
    if (!r.ok) return;
    const data = await r.json();
    const mt = data.metric_titles || {};
    Object.keys(mt).forEach(k => {
      const el = document.querySelector(`.metric-label[data-key="${k}"]`);
      if (el) el.textContent = mt[k];
    });
  } catch (e) {
    // ignore
  }
}

// Load persisted metric titles on DOM load
window.addEventListener('DOMContentLoaded', () => { try { loadUserMetricTitles(); } catch (e) {} });
// Create User Modal Controls
const showCreateUserBtn = document.getElementById('showCreateUserBtn');
const createUserModal = document.getElementById('createUserModal');
const closeCreateUserBtn = document.getElementById('closeCreateUserBtn');

// --- Mobile App User ---
const showCreateMobileUserBtn = document.getElementById('showCreateMobileUserBtn');
const createMobileUserModal = document.getElementById('createMobileUserModal');
const closeCreateMobileUserBtn = document.getElementById('closeCreateMobileUserBtn');

function openMobilePage(hashRoute, windowName) {
  const token = sessionStorage.getItem('token');
  console.log('[MobileSFA] token:', token ? 'found' : 'NOT FOUND');
  if (!token) {
    showNotification('You must be logged in to open the mobile app.', 'warning');
    return;
  }
  const username = sessionStorage.getItem('username') || '';
  const role = sessionStorage.getItem('role') || '';
  const params = new URLSearchParams({ token, username, role });
  const safeHashRoute = (hashRoute || 'config').replace(/^#/, '');
  const url = `http://localhost:5000/app.html?${params.toString()}#${safeHashRoute}`;
  console.log('[MobileSFA] opening:', url);
  // Use anchor click to avoid popup blocker
  const a = document.createElement('a');
  a.href = url;
  a.target = windowName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Manage Mobile SFA modal
const showMobileSFABtn = document.getElementById('showMobileSFABtn');
const mobileSFAModal = document.getElementById('mobileSFAModal');
const closeMobileSFABtn = document.getElementById('closeMobileSFABtn');

if (showMobileSFABtn && mobileSFAModal) {
  showMobileSFABtn.onclick = () => { mobileSFAModal.style.display = 'block'; };
}
if (closeMobileSFABtn && mobileSFAModal) {
  closeMobileSFABtn.onclick = () => { mobileSFAModal.style.display = 'none'; };
}
if (mobileSFAModal) {
  window.addEventListener('click', (ev) => { if (ev.target === mobileSFAModal) mobileSFAModal.style.display = 'none'; });
}

const mobileSFAHomeBtn = document.getElementById('mobileSFAHomeBtn');
if (mobileSFAHomeBtn) {
  mobileSFAHomeBtn.onclick = () => { openMobilePage('config', 'MobileApp'); mobileSFAModal.style.display = 'none'; };
}

const mobileSFACreateUserBtn = document.getElementById('mobileSFACreateUserBtn');
if (mobileSFACreateUserBtn) {
  mobileSFACreateUserBtn.onclick = () => { openMobilePage('config', 'MobileApp'); mobileSFAModal.style.display = 'none'; };
}

const mobileSFACustomersBtn = document.getElementById('mobileSFACustomersBtn');
if (mobileSFACustomersBtn) {
  mobileSFACustomersBtn.onclick = () => { openMobilePage('config', 'MobileAppCustomers'); mobileSFAModal.style.display = 'none'; };
}

const mobileSFAOrdersBtn = document.getElementById('mobileSFAOrdersBtn');
if (mobileSFAOrdersBtn) {
  mobileSFAOrdersBtn.onclick = () => { openMobilePage('config', 'MobileAppOrders'); mobileSFAModal.style.display = 'none'; };
}
if (closeCreateMobileUserBtn && createMobileUserModal) {
  closeCreateMobileUserBtn.onclick = () => { createMobileUserModal.style.display = 'none'; };
}
if (createMobileUserModal) {
  window.addEventListener('click', (event) => {
    if (event.target === createMobileUserModal) createMobileUserModal.style.display = 'none';
  });
}

const createMobileUserBtn = document.getElementById('createMobileUserBtn');
if (createMobileUserBtn) {
  createMobileUserBtn.onclick = async () => {
    const username = document.getElementById('mobileUsername').value.trim();
    const password = document.getElementById('mobilePassword').value;
    const role = document.getElementById('mobileUserRole').value;
    const msgEl = document.getElementById('createMobileUserMsg');

    if (!username || !password) {
      msgEl.innerText = 'Username and password are required';
      msgEl.style.color = 'red';
      return;
    }

    try {
      const token = sessionStorage.getItem('token');
      const fd = new FormData();
      fd.append('username', username);
      fd.append('password', password);
      fd.append('role', role);

      const res = await fetch('/create-user', {
        method: 'POST',
        body: fd,
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      });

      if (res.ok) {
        msgEl.innerText = '✓ Mobile user created! Redirecting to mobile app...';
        msgEl.style.color = 'green';
        loadUsers();
        setTimeout(() => {
          createMobileUserModal.style.display = 'none';
          openMobilePage('config', 'MobileApp');
        }, 1000);
      } else {
        const err = await res.text();
        msgEl.innerText = 'Error: ' + err;
        msgEl.style.color = 'red';
      }
    } catch (e) {
      msgEl.innerText = 'Error: ' + e.message;
      msgEl.style.color = 'red';
    }
  };
}

if (showCreateUserBtn && createUserModal) {
  showCreateUserBtn.onclick = () => {
    createUserModal.style.display = 'block';
    document.getElementById('createUserMsg').innerText = '';
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
  };
}

if (closeCreateUserBtn && createUserModal) {
  closeCreateUserBtn.onclick = () => {
    createUserModal.style.display = 'none';
  };
}

// Close modal when clicking outside
if (createUserModal) {
  window.addEventListener('click', (event) => {
    if (event.target === createUserModal) {
      createUserModal.style.display = 'none';
    }
  });
}

// Create User
const createUserBtn = document.getElementById('createUserBtn');
if (createUserBtn) {
  createUserBtn.onclick = async () => {
    const username = document.getElementById('newUsername').value;
    const password = document.getElementById('newPassword').value;
    const role = document.getElementById('newUserRole').value;
    const msgEl = document.getElementById('createUserMsg');
    
    if (!username || !password) {
      msgEl.innerText = 'Username and password are required';
      msgEl.style.color = 'red';
      return;
    }
    
    try {
      const token = sessionStorage.getItem('token');
      const fd = new FormData();
      fd.append('username', username);
      fd.append('password', password);
      fd.append('role', role);
      
      const res = await fetch('/create-user', {
        method: 'POST',
        body: fd,
        headers: token ? {'Authorization': 'Bearer ' + token} : {}
      });
      
      if (res.ok) {
        const data = await res.json();
        msgEl.innerText = '✓ User created successfully!\nUsername: ' + username;
        msgEl.style.color = 'green';
        msgEl.style.whiteSpace = 'pre-line';
        document.getElementById('newUsername').value = '';
        document.getElementById('newPassword').value = '';
        loadUsers();
        
        // Redirect to mobile app after 1 second
        setTimeout(() => {
          createUserModal.style.display = 'none';
          openMobilePage('config', 'MobileApp');
        }, 1000);
      } else {
        const err = await res.text();
        msgEl.innerText = 'Error: ' + err;
        msgEl.style.color = 'red';
      }
    } catch (e) {
      msgEl.innerText = 'Error: ' + e.message;
      msgEl.style.color = 'red';
    }
  }
}

// Load Users List
async function loadUsers() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/users', {
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    const listEl = document.getElementById('usersList');
    if (!listEl) return;

    if (!res.ok) {
      if (res.status === 503) {
        listEl.innerHTML = '<div style="padding:12px; background:#fff3cd; border:1px solid #ffe08a; color:#7a5e00; border-radius:6px;">SQL Server not configured or reachable. Configure Main DB on the login page first.</div>';
      } else {
        listEl.innerHTML = '<div style="padding:12px; color:#c62828;">Failed to load users</div>';
      }
      return;
    }

    const users = await res.json();
    // Cache users for the visible dropdown fallback
    try { window.cachedUsers = users || []; } catch(e) { window.cachedUsers = users || []; }
    // Populate shared datalist for username suggestions (allows free-text too)
    try {
      const datalist = document.getElementById('userOptions');
      if (datalist) {
        datalist.innerHTML = '';
        users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.username;
          datalist.appendChild(opt);
        });
      }
    } catch (e) {
      console.warn('Failed to populate user datalist:', e);
    }
    if (!users || users.length === 0) {
      listEl.innerHTML = '<div style="padding:12px; color:#666;">No users found. Use "Create User" to add one.</div>';
      return;
    }

    let html = '<table style="width:100%; border-collapse: collapse; margin-top: 10px;"><thead><tr><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">ID</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Username</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Role</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Created</th><th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Actions</th></tr></thead><tbody>';
    users.forEach(u => {
      html += `<tr>
        <td style="border: 1px solid #ddd; padding: 8px;">${u.id}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${u.username}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${u.role}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">${u.created_at || 'N/A'}</td>
        <td style="border: 1px solid #ddd; padding: 8px;">
          <button onclick="editUser(${u.id}, '${u.username}', '${u.role}')" style="padding: 4px 8px; margin-right: 5px; background: #667eea; color: white; border: none; border-radius: 4px; cursor: pointer;">Edit</button>
          <button onclick="deleteUser(${u.id}, '${u.username}')" style="padding: 4px 8px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>
        </td>
      </tr>`;
    });
    html += '</tbody></table>';
    listEl.innerHTML = html;
  } catch (e) {
    const listEl = document.getElementById('usersList');
    if (listEl) listEl.innerHTML = '<div style="padding:12px; color:#c62828;">Error: ' + (e.message || e) + '</div>';
    console.error('Failed to load users:', e);
  }
}

// Visible dropdown fallback: show selectable list next to input when user presses the small button
function showUserDropdown(targetInputId, anchorEl) {
  const input = document.getElementById(targetInputId);
  if (!input) return;
  const users = window.cachedUsers || [];
  // Create or reuse dropdown container
  let dd = document.getElementById('userDropdownList');
  if (!dd) {
    dd = document.createElement('div');
    dd.id = 'userDropdownList';
    dd.style.position = 'absolute';
    dd.style.zIndex = '200000';
    dd.style.background = 'white';
    dd.style.border = '1px solid #ddd';
    dd.style.borderRadius = '6px';
    dd.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)';
    dd.style.maxHeight = '260px';
    dd.style.overflow = 'auto';
    dd.style.minWidth = '220px';
    document.body.appendChild(dd);
  }
  // Build list filtered by current input value
  const q = (input.value || '').toLowerCase();
  const items = users.filter(u => (u.username || '').toLowerCase().includes(q)).slice(0,200);
  dd.innerHTML = '';
  if (!items.length) {
    const el = document.createElement('div'); el.textContent = 'No users'; el.style.padding = '8px'; el.style.color = '#666'; dd.appendChild(el);
  } else {
    items.forEach(u => {
      const el = document.createElement('div');
      el.textContent = u.username;
      el.style.padding = '8px 10px';
      el.style.cursor = 'pointer';
      el.style.borderBottom = '1px solid #f4f4f6';
      el.onmouseover = () => { el.style.background = '#f3f4f6'; };
      el.onmouseout = () => { el.style.background = 'transparent'; };
      el.onclick = () => { input.value = u.username; hideUserDropdown(); input.focus(); };
      dd.appendChild(el);
    });
  }
  // position near anchorEl
  const rect = anchorEl.getBoundingClientRect();
  dd.style.left = (rect.left + window.scrollX) + 'px';
  dd.style.top = (rect.bottom + window.scrollY + 6) + 'px';
  dd.style.display = 'block';
  // focus management: clicking outside closes
  setTimeout(() => { window.addEventListener('click', onDocClickForUserDropdown); }, 10);
}

function hideUserDropdown() {
  const dd = document.getElementById('userDropdownList');
  if (dd) dd.style.display = 'none';
  window.removeEventListener('click', onDocClickForUserDropdown);
}

function onDocClickForUserDropdown(ev) {
  const dd = document.getElementById('userDropdownList');
  if (!dd) return window.removeEventListener('click', onDocClickForUserDropdown);
  if (ev.target.closest && ev.target.closest('#userDropdownList')) return;
  if (ev.target.classList && ev.target.classList.contains('userDropdownBtn')) return;
  hideUserDropdown();
}

// Users Modal Controls
const showUsersBtn = document.getElementById('showUsersBtn');
const usersModal = document.getElementById('usersModal');
const closeUsersBtn = document.getElementById('closeUsersBtn');

if (showUsersBtn && usersModal) {
  showUsersBtn.onclick = () => {
    usersModal.style.display = 'block';
    loadUsers();
  };
}

if (closeUsersBtn && usersModal) {
  closeUsersBtn.onclick = () => {
    usersModal.style.display = 'none';
  };
}

// Close modal when clicking outside
if (usersModal) {
  window.addEventListener('click', (event) => {
    if (event.target === usersModal) {
      usersModal.style.display = 'none';
    }
  });
}

const refreshUsersBtn = document.getElementById('refreshUsersBtn');
if (refreshUsersBtn) refreshUsersBtn.onclick = loadUsers;

// Edit User Modal
const editUserModal = document.getElementById('editUserModal');
const closeEditUserBtn = document.getElementById('closeEditUserBtn');
const saveUserBtn = document.getElementById('saveUserBtn');

if (closeEditUserBtn && editUserModal) {
  closeEditUserBtn.onclick = () => {
    editUserModal.style.display = 'none';
  };
}

// Close edit modal when clicking outside
if (editUserModal) {
  window.addEventListener('click', (event) => {
    if (event.target === editUserModal) {
      editUserModal.style.display = 'none';
    }
  });
}

// Edit User function
window.editUser = (id, username, role) => {
  document.getElementById('editUserId').value = id;
  document.getElementById('editUsername').value = username;
  document.getElementById('editPassword').value = '';
  document.getElementById('editUserRole').value = role;
  document.getElementById('editUserMsg').innerText = '';
  editUserModal.style.display = 'block';
};

// Save User Changes
if (saveUserBtn) {
  saveUserBtn.onclick = async () => {
    const userId = document.getElementById('editUserId').value;
    const username = document.getElementById('editUsername').value;
    const password = document.getElementById('editPassword').value;
    const role = document.getElementById('editUserRole').value;
    const msgEl = document.getElementById('editUserMsg');
    
    if (!username) {
      msgEl.innerText = 'Username is required';
      msgEl.style.color = 'red';
      return;
    }
    
    try {
      const token = sessionStorage.getItem('token');
      const fd = new FormData();
      fd.append('username', username);
      if (password) fd.append('password', password);
      fd.append('role', role);
      
      const res = await fetch(`/users/${userId}`, {
        method: 'PUT',
        body: fd,
        headers: token ? {'Authorization': 'Bearer ' + token} : {}
      });
      
      if (res.ok) {
        msgEl.innerText = '✓ User updated successfully!\nUsername: ' + username;
        msgEl.style.color = 'green';
        msgEl.style.whiteSpace = 'pre-line';
        loadUsers();
        
        setTimeout(() => {
          editUserModal.style.display = 'none';
        }, 1000);
      } else {
        const err = await res.text();
        msgEl.innerText = 'Error: ' + err;
        msgEl.style.color = 'red';
      }
    } catch (e) {
      msgEl.innerText = 'Error: ' + e.message;
      msgEl.style.color = 'red';
    }
  };
}

// Delete User function
window.deleteUser = async (id, username) => {
  if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
    return;
  }
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/users/${id}`, {
      method: 'DELETE',
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    
    if (res.ok) {
      showNotification('✓ User deleted successfully!\nUsername: ' + username, 'success');
      loadUsers();
    } else {
      const err = await res.text();
      showNotification('✗ Error deleting user:\n' + err, 'error');
    }
  } catch (e) {
    showNotification('✗ Error: ' + e.message, 'error');
  }
};

// Database Connection Modal (guarded if elements are present)
const dbConnectionBtn = document.getElementById('dbConnectionBtn');
const dbConnectionModal = document.getElementById('dbConnectionModal');
const closeModalBtn = document.getElementById('closeModalBtn');
if (dbConnectionBtn && dbConnectionModal) {
  dbConnectionBtn.onclick = () => { dbConnectionModal.style.display = 'block'; }
}
if (closeModalBtn && dbConnectionModal) {
  closeModalBtn.onclick = () => { dbConnectionModal.style.display = 'none'; }
}

// Toggle Windows Auth vs SQL Auth fields
const useTrustedEl = document.getElementById('useTrustedConnection');
if (useTrustedEl) {
  useTrustedEl.onchange = (e) => {
    const sqlAuthFields = document.getElementById('sqlAuthFields');
    if (!sqlAuthFields) return;
    if (e.target.checked) {
      sqlAuthFields.style.display = 'none';
    } else {
      sqlAuthFields.style.display = 'block';
    }
  }
}

// Close modal when clicking outside
if (dbConnectionModal) {
  window.addEventListener('click', (event) => {
    if (event.target === dbConnectionModal) {
      dbConnectionModal.style.display = 'none';
    }
  });
}

async function loadDbInfo() {
  try {
    // If modal fields are not present on this page, skip
    const serverNameEl = document.getElementById('serverName');
    const databaseNameEl = document.getElementById('databaseName');
    const connectionStatusEl = document.getElementById('connectionStatus');
    if (!serverNameEl || !databaseNameEl || !connectionStatusEl) return;

    const token = sessionStorage.getItem('token');
    const res = await fetch('/diag', {
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    
    if (res.ok) {
      const data = await res.json();
      
      // Parse server and database from db_url
      let serverName = 'N/A';
      let databaseName = 'N/A';
      
      if (data.db_url) {
        // Example: sqlite:///./reportapp.db or mssql+pyodbc://server/database?...
        if (data.db_url.includes('sqlite')) {
          serverName = 'SQLite (Local)';
          const match = data.db_url.match(/sqlite:\/\/\/(.+)/);
          databaseName = match ? match[1] : 'reportapp.db';
        } else if (data.db_url.includes('mssql')) {
          const match = data.db_url.match(/\/\/([^\/]+)\/([^\?]+)/);
          if (match) {
            serverName = match[1];
            databaseName = match[2];
          }
        }
      }
      
      serverNameEl.innerText = serverName;
      databaseNameEl.innerText = databaseName;
      connectionStatusEl.innerText = data.users_count !== undefined ? `✓ Connected (${data.users_count} users)` : '✓ Connected';
      connectionStatusEl.style.color = '#28a745';
    } else {
      serverNameEl.innerText = 'Error';
      databaseNameEl.innerText = 'Error';
      connectionStatusEl.innerText = '✗ Failed';
      connectionStatusEl.style.color = '#dc3545';
    }
  } catch (e) {
    const serverNameEl = document.getElementById('serverName');
    const databaseNameEl = document.getElementById('databaseName');
    const connectionStatusEl = document.getElementById('connectionStatus');
    if (serverNameEl) serverNameEl.innerText = 'Error';
    if (databaseNameEl) databaseNameEl.innerText = 'Error';
    if (connectionStatusEl) {
      connectionStatusEl.innerText = '✗ Error: ' + e.message;
      connectionStatusEl.style.color = '#dc3545';
    }
  }
}

// Lightweight banner status for dashboard
async function updateDbBanner() {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/diag', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
    if (res.ok) {
      const data = await res.json();
      
      // Test actual SQL Server connection
      let isConnected = false;
      let dbType = 'Unknown';
      let errorMsg = '';
      let userCount = 0;
      
      if (data.db_url && data.db_url.includes('mssql')) {
        dbType = 'SQL Server';
        // Try to fetch users to verify connection (only for admin)
        const role = sessionStorage.getItem('role');
        if (role === 'admin') {
          try {
            const usersRes = await fetch('/users', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
            if (usersRes.ok) {
              const users = await usersRes.json();
              userCount = users.length;
              isConnected = true;
            } else if (usersRes.status === 503) {
              isConnected = false;
              const errData = await usersRes.json();
              errorMsg = errData.detail || 'SQL Server not available';
            } else {
              isConnected = false;
              errorMsg = 'Failed to verify connection';
            }
          } catch (e) {
            isConnected = false;
            errorMsg = 'Connection test failed: ' + e.message;
          }
        } else {
          // For non-admin users, just check if db_url exists
          isConnected = true;
        }
      } else if (data.db_url && data.db_url.includes('sqlite')) {
        dbType = 'SQLite';
        isConnected = true;
        if (typeof data.users_count !== 'undefined') userCount = data.users_count;
      }
      
      // Update UI based on connection status
      el.className = 'db-status-badge ' + (isConnected ? 'connected' : 'error');
      
      if (isConnected) {
        el.textContent = `${dbType} Connected` + (userCount > 0 ? ` • ${userCount} users` : '');
        el.title = `Database: ${dbType}\nStatus: Connected\nUsers: ${userCount}`;
      } else {
        el.textContent = `${dbType} Error`;
        el.title = `Database: ${dbType}\nStatus: Connection Failed\nError: ${errorMsg || 'Unable to connect'}`;
      }
    } else {
      el.className = 'db-status-badge error';
      el.textContent = 'DB Status Unavailable';
      el.title = 'Unable to fetch database status';
    }
  } catch (e) {
    el.className = 'db-status-badge error';
    el.textContent = 'DB Error';
    el.title = 'Error: ' + e.message;
  }
}

// Load dashboard summary metrics and populate tiles
async function loadDashboardSummary() {
  console.log('[Dashboard] Loading summary statistics...');
  try {
    const usersEl = document.getElementById('summaryUsers');
    const impEl = document.getElementById('summaryImports');
    const impLastEl = document.getElementById('summaryImportsLast');
    const repEl = document.getElementById('summaryReports');
    const repLastEl = document.getElementById('summaryReportsLast');
    const tablesEl = document.getElementById('summaryTables');
    
    console.log('[Dashboard] Elements found:', {
      usersEl: !!usersEl,
      impEl: !!impEl,
      repEl: !!repEl,
      tablesEl: !!tablesEl
    });
    
    if (!usersEl || !impEl || !repEl) {
      console.warn('[Dashboard] Missing required elements, aborting');
      return;
    }

    const token = sessionStorage.getItem('token');
    console.log('[Dashboard] Fetching /dashboard/summary...');
    const res = await fetch('/dashboard/summary', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    
    console.log('[Dashboard] Response status:', res.status);
    
    if (!res.ok) {
      // Graceful fallback when SQL Server not configured/available or server error
      console.warn('[Dashboard] Summary endpoint returned error, using fallback values');
      usersEl.textContent = '0';
      impEl.textContent = '0';
      repEl.textContent = '0';
      if (tablesEl) tablesEl.textContent = '0';
      if (impLastEl) impLastEl.textContent = 'Configure SQL Server to enable statistics';
      if (repLastEl) repLastEl.textContent = 'Configure SQL Server to enable statistics';
      return;
    }
    const data = await res.json();
    console.log('[Dashboard] Received data:', data);

    // Animate numbers counting up
    animateValue(usersEl, 0, data.users_total || 0, 800);
    animateValue(impEl, 0, data.imports_total || 0, 1000);
    animateValue(repEl, 0, data.reports_total || 0, 1200);
    if (tablesEl) {
      animateValue(tablesEl, 0, data.tables_count || 0, 900);
    }

    if (data.imports_last_at) {
      const lastDate = new Date(data.imports_last_at);
      impLastEl.textContent = 'Last: ' + formatRelativeTime(lastDate);
      impLastEl.title = lastDate.toLocaleString();
    } else if (impLastEl) {
      impLastEl.textContent = 'No imports yet';
    }

    if (data.reports_last_at) {
      const lastDate = new Date(data.reports_last_at);
      repLastEl.textContent = 'Last: ' + formatRelativeTime(lastDate);
      repLastEl.title = lastDate.toLocaleString();
    } else if (repLastEl) {
      repLastEl.textContent = 'No reports yet';
    }
    
    // Load recent activity
    loadRecentActivity();
  } catch (e) {
    // Fallback in case of network/parse errors
    try {
      const usersEl = document.getElementById('summaryUsers');
      const impEl = document.getElementById('summaryImports');
      const repEl = document.getElementById('summaryReports');
      const tablesEl = document.getElementById('summaryTables');
      const impLastEl = document.getElementById('summaryImportsLast');
      const repLastEl = document.getElementById('summaryReportsLast');
      if (usersEl && impEl && repEl) {
        usersEl.textContent = '0';
        impEl.textContent = '0';
        repEl.textContent = '0';
        if (tablesEl) tablesEl.textContent = '0';
        if (impLastEl) impLastEl.textContent = 'Configure SQL Server to enable statistics';
        if (repLastEl) repLastEl.textContent = 'Configure SQL Server to enable statistics';
      }
    } catch {}
    console.error('Failed to load dashboard summary:', e);
  }
}

function animateValue(element, start, end, duration) {
  const range = end - start;
  const increment = range / (duration / 16);
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
      element.textContent = formatNumber(end);
      clearInterval(timer);
    } else {
      element.textContent = formatNumber(Math.floor(current));
    }
  }, 16);
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return diffMins + ' min ago';
  if (diffHours < 24) return diffHours + ' hour' + (diffHours > 1 ? 's' : '') + ' ago';
  if (diffDays < 7) return diffDays + ' day' + (diffDays > 1 ? 's' : '') + ' ago';
  return date.toLocaleDateString();
}

async function loadRecentActivity() {
  console.log('[Dashboard] Loading recent activity...');
  const activityEl = document.getElementById('recentActivity');
  if (!activityEl) {
    console.warn('[Dashboard] recentActivity element not found');
    return;
  }
  
  try {
    const token = sessionStorage.getItem('token');
    console.log('[Dashboard] Fetching /recent-activity...');
    const res = await fetch('/recent-activity', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    
    console.log('[Dashboard] Recent activity response status:', res.status);
    
    if (!res.ok) {
      console.warn('[Dashboard] Recent activity endpoint returned error');
      activityEl.innerHTML = `
        <div style="text-align: center; color: #999; padding: 40px 20px;">
          <span style="font-size: 48px; opacity: 0.3;">📋</span>
          <p style="margin-top: 10px;">No recent activity</p>
        </div>
      `;
      return;
    }
    const data = await res.json();
    
    if (!data.activities || data.activities.length === 0) {
      activityEl.innerHTML = `
        <div style="text-align: center; color: #999; padding: 40px 20px;">
          <span style="font-size: 48px; opacity: 0.3;">📋</span>
          <p style="margin-top: 10px;">No recent activity</p>
        </div>
      `;
      return;
    }
    
    activityEl.innerHTML = data.activities.map(activity => {
      const icon = activity.type === 'import' ? '📥' : activity.type === 'report' ? '📊' : '📄';
      const color = activity.type === 'import' ? '#4facfe' : activity.type === 'report' ? '#f093fb' : '#667eea';
      const time = new Date(activity.timestamp);
      
      return `
        <div style="display: flex; align-items: start; gap: 12px; padding: 12px; border-left: 3px solid ${color}; background: #f8f9fa; border-radius: 6px; margin-bottom: 10px;">
          <span style="font-size: 24px;">${icon}</span>
          <div style="flex: 1;">
            <div style="font-weight: 600; color: #333; margin-bottom: 4px;">${activity.description}</div>
            <div style="font-size: 12px; color: #666;">
              <span style="opacity: 0.8;">${activity.user || 'System'}</span>
              <span style="margin: 0 8px;">•</span>
              <span title="${time.toLocaleString()}">${formatRelativeTime(time)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load recent activity:', e);
  }
}

const connectBtn = document.getElementById('connectBtn');
if (connectBtn) connectBtn.onclick = async () => {
  const msgEl = document.getElementById('dbConnectionMsg');
  const serverName = document.getElementById('newServerName').value;
  const databaseName = document.getElementById('newDatabaseName').value;
  const useTrusted = document.getElementById('useTrustedConnection').checked;
  const username = document.getElementById('sqlUsername').value;
  const password = document.getElementById('sqlPassword').value;
  
  if (!serverName || !databaseName) {
    msgEl.innerText = '✗ Please enter both server and database name.';
    msgEl.style.backgroundColor = '#fff3cd';
    msgEl.style.color = '#856404';
    msgEl.style.border = '1px solid #ffeaa7';
    return;
  }
  
  if (!useTrusted && (!username || !password)) {
    msgEl.innerText = '✗ Please enter username and password for SQL Authentication.';
    msgEl.style.backgroundColor = '#fff3cd';
    msgEl.style.color = '#856404';
    msgEl.style.border = '1px solid #ffeaa7';
    return;
  }
  
  msgEl.innerText = 'Connecting to SQL Server...';
  msgEl.style.backgroundColor = '#d1ecf1';
  msgEl.style.color = '#0c5460';
  msgEl.style.border = '1px solid #bee5eb';
  
  try {
    const token = sessionStorage.getItem('token');
    const payload = {
      driver: 'ODBC Driver 17 for SQL Server',
      host: serverName,
      port: 1433,
      database: databaseName,
      trusted: useTrusted,
      encrypt: false
    };
    
    if (!useTrusted) {
      payload.username = username;
      payload.password = password;
    }
    
    const res = await fetch('/settings/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : ''
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      const data = await res.json();
      msgEl.innerText = '✓ Settings Saved Successfully!\n\n' +
        '🖥️ Server: ' + serverName + '\n' +
        '💾 Database: ' + databaseName + '\n\n' +
        'Application will use this database connection.';
      msgEl.style.backgroundColor = '#d4edda';
      msgEl.style.color = '#155724';
      msgEl.style.border = '1px solid #c3e6cb';
      msgEl.style.whiteSpace = 'pre-line';
      
      // Refresh the info display
      setTimeout(() => loadDbInfo(), 1000);
    } else {
      const errorText = await res.text();
      msgEl.innerText = '✗ Connection failed: ' + errorText;
      msgEl.style.backgroundColor = '#f8d7da';
      msgEl.style.color = '#721c24';
      msgEl.style.border = '1px solid #f5c6cb';
    }
  } catch (e) {
    msgEl.innerText = '✗ Error: ' + e.message;
    msgEl.style.backgroundColor = '#f8d7da';
    msgEl.style.color = '#721c24';
    msgEl.style.border = '1px solid #f5c6cb';
  }
}

const testConnectionBtn = document.getElementById('testConnectionBtn');
if (testConnectionBtn) testConnectionBtn.onclick = async () => {
  const msgEl = document.getElementById('dbConnectionMsg');
  const serverName = document.getElementById('newServerName').value;
  const databaseName = document.getElementById('newDatabaseName').value;
  const useTrusted = document.getElementById('useTrustedConnection').checked;
  const username = document.getElementById('sqlUsername').value;
  const password = document.getElementById('sqlPassword').value;
  
  if (!serverName || !databaseName) {
    msgEl.innerText = '✗ Please enter server and database name first.';
    msgEl.style.backgroundColor = '#fff3cd';
    msgEl.style.color = '#856404';
    msgEl.style.border = '1px solid #ffeaa7';
    return;
  }
  
  if (!useTrusted && (!username || !password)) {
    msgEl.innerText = '✗ Please enter username and password for SQL Authentication.';
    msgEl.style.backgroundColor = '#fff3cd';
    msgEl.style.color = '#856404';
    msgEl.style.border = '1px solid #ffeaa7';
    return;
  }
  
  msgEl.innerText = 'Testing connection to ' + serverName + '...';
  msgEl.style.backgroundColor = '#d1ecf1';
  msgEl.style.color = '#0c5460';
  msgEl.style.border = '1px solid #bee5eb';
  
  try {
    const token = sessionStorage.getItem('token');
    const payload = {
      driver: 'ODBC Driver 17 for SQL Server',
      host: serverName,
      port: 1433,
      database: databaseName,
      trusted: useTrusted,
      encrypt: false
    };
    
    if (!useTrusted) {
      payload.username = username;
      payload.password = password;
    }
    
    const res = await fetch('/settings/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? 'Bearer ' + token : ''
      },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        msgEl.innerText = '✓ Connection Test Successful!\n\n' +
          '🖥️ Server: ' + serverName + '\n' +
          '💾 Database: ' + databaseName + '\n' +
          '🔧 Driver: ' + (data.used_driver || 'ODBC Driver 17 for SQL Server') + '\n\n' +
          'You can now save these settings.';
        msgEl.style.backgroundColor = '#d4edda';
        msgEl.style.color = '#155724';
        msgEl.style.border = '1px solid #c3e6cb';
        msgEl.style.whiteSpace = 'pre-line';
      } else {
        let errorMsg = '✗ Connection test failed!\n\n' + (data.message || 'Unable to connect');
        
        // Add technical details if available (in smaller text)
        if (data.details) {
          errorMsg += '\n\n' + '─'.repeat(50) + '\nTechnical Details:\n' + data.details;
        }
        
        msgEl.innerText = errorMsg;
        msgEl.style.backgroundColor = '#f8d7da';
        msgEl.style.color = '#721c24';
        msgEl.style.border = '1px solid #f5c6cb';
        msgEl.style.whiteSpace = 'pre-line';
        msgEl.style.fontSize = '13px';
      }
    } else {
      const errorText = await res.text();
      msgEl.innerText = '✗ Connection test failed!\n\n' + errorText;
      msgEl.style.backgroundColor = '#f8d7da';
      msgEl.style.color = '#721c24';
      msgEl.style.border = '1px solid #f5c6cb';
      msgEl.style.whiteSpace = 'pre-line';
    }
  } catch (e) {
    msgEl.innerText = '✗ Error: ' + e.message;
    msgEl.style.backgroundColor = '#f8d7da';
    msgEl.style.color = '#721c24';
    msgEl.style.border = '1px solid #f5c6cb';
  }
}

// Load tables from database
async function loadTables() {
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/tables', {
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    
    if (res.ok) {
      const data = await res.json();
      const selectEl = document.getElementById('tableSelect');
      
      // Clear existing options except the first two
      selectEl.innerHTML = '<option value="">-- Select a table --</option>';
      selectEl.innerHTML += '<option value="__CREATE_NEW__">✨ Create New Table (from filename)</option>';
      
      // Add tables to dropdown
      data.tables.forEach(tableName => {
        const option = document.createElement('option');
        option.value = tableName;
        option.textContent = tableName;
        selectEl.appendChild(option);
      });
    } else {
      console.error('Failed to load tables');
    }
  } catch (e) {
    console.error('Error loading tables:', e);
  }
}

// Import Modal Controls
const showImportBtn = document.getElementById('showImportBtn');
const importModal = document.getElementById('importModal');
const closeImportBtn = document.getElementById('closeImportBtn');
const fileInput = document.getElementById('fileInput');
const sheetNameSelect = document.getElementById('sheetName');

// Load sheet names when Excel file is selected
if (fileInput && sheetNameSelect) {
  fileInput.addEventListener('change', async () => {
    const files = fileInput.files;
    sheetNameSelect.innerHTML = '<option value="">-- Select sheet --</option>';
    
    if (!files.length) return;
    
    const file = files[0];
    const ext = file.name.toLowerCase().split('.').pop();
    
    // Only fetch sheet names for Excel files
    if (ext === 'xlsx' || ext === 'xls') {
      try {
        const fd = new FormData();
        fd.append('file', file);
        
        const token = sessionStorage.getItem('token');
        const res = await fetch('/get-sheet-names', {
          method: 'POST',
          body: fd,
          headers: token ? {'Authorization': 'Bearer ' + token} : {}
        });
        
        if (res.ok) {
          const data = await res.json();
          const sheets = data.sheet_names || [];
          
          sheets.forEach(sheetName => {
            const option = document.createElement('option');
            option.value = sheetName;
            option.textContent = sheetName;
            sheetNameSelect.appendChild(option);
          });
          
          // Auto-select first sheet
          if (sheets.length > 0) {
            sheetNameSelect.value = sheets[0];
          }
        }
      } catch (e) {
        console.error('Failed to load sheet names:', e);
      }
    } else {
      // For CSV, just show N/A
      sheetNameSelect.innerHTML = '<option value="">N/A (CSV file)</option>';
    }
  });
}

// Admin import button - Navigate to import page
if (showImportBtn) {
  showImportBtn.onclick = () => {
    navigateTo('/import');
  };
}

// User import button (for non-admin users) - Navigate to import page
const showImportBtnUser = document.getElementById('showImportBtnUser');
if (showImportBtnUser) {
  showImportBtnUser.onclick = () => {
    navigateTo('/import');
  };
}

// Report button (for all users) — check for token first to preserve UX
const showReportBtn = document.getElementById('showReportBtn');
if (showReportBtn) {
  showReportBtn.onclick = () => {
    const token = sessionStorage.getItem('token');
    if (!token) {
      // Redirect unauthenticated users to login and return them to the report page
      window.location.href = '/login?next=/report';
      return;
    }
    navigateTo('/report');
  };
}


const refreshDefsBtn = document.getElementById('refreshDefsBtn');
if (refreshDefsBtn) refreshDefsBtn.onclick = loadReportDefinitions;


const saveDefBtn = document.getElementById('saveDefBtn');
if (saveDefBtn) saveDefBtn.onclick = async () => {
  const token = sessionStorage.getItem('token');
  const rn = document.getElementById('defReportName').value.trim();
  const sp = document.getElementById('defStoredProc').value.trim();
  const paramsCsv = document.getElementById('defParameters').value.trim();
  const active = document.getElementById('defActive').checked;
  const msg = document.getElementById('defMsg');
  if (!rn || !sp) { msg.textContent='Report name and stored procedure are required.'; return; }
  // Prefer structured parameters JSON from the editor when present
  const paramsJsonEl = document.getElementById('defParametersJson');
  // Normalize CSV parameters: split, trim, remove leading @ characters
  let parametersPayload = paramsCsv ? paramsCsv.split(',').map(s=>s.trim().replace(/^@+/, '')).filter(Boolean) : [];
  if (paramsJsonEl && paramsJsonEl.value && paramsJsonEl.value.trim()) {
    try {
      const parsed = JSON.parse(paramsJsonEl.value);
      if (Array.isArray(parsed)) parametersPayload = parsed;
      else { msg.textContent = 'Parameters JSON must be an array'; return; }
    } catch (e) { msg.textContent = 'Invalid parameters JSON: ' + e.message; return; }
  }

  const body = {
    report_name: rn,
    stored_procedure: sp,
    parameters: parametersPayload,
    active: active
  };
  try {
    let r;
    if (currentDefId) {
      r = await fetch('/report/definitions/' + currentDefId, {
        method:'PUT', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
    } else {
      r = await fetch('/report/definitions', {
        method:'POST', headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'}, body: JSON.stringify(body)
      });
    }
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Save failed');
    msg.textContent = 'Saved.';
    loadReportDefinitions();
  } catch(e){ msg.textContent = e.message; }
};

const deleteDefBtn = document.getElementById('deleteDefBtn');
if (deleteDefBtn) deleteDefBtn.onclick = async () => {
  if (!currentDefId) { const msg = document.getElementById('defMsg'); if (msg) msg.textContent='Select a definition first.'; return; }
  if (!confirm('Delete this definition?')) return;
  const token = sessionStorage.getItem('token');
  const msg = document.getElementById('defMsg');
  try {
    const r = await fetch('/report/definitions/' + currentDefId, { method:'DELETE', headers:{'Authorization':'Bearer '+token} });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || 'Delete failed');
    msg.textContent='Deleted.';
    currentDefId = null;
    document.getElementById('defReportName').value='';
    document.getElementById('defStoredProc').value='';
    document.getElementById('defParameters').value='';
    document.getElementById('defActive').checked=true;
    loadReportDefinitions();
  } catch(e){ msg.textContent=e.message; }
};

// Parameter Editor Modal wiring
const editParamsBtn = document.getElementById('editParamsBtn');
const paramEditorModal = document.getElementById('paramEditorModal');
const paramsEditorList = document.getElementById('paramsEditorList');
const addParamRowBtn = document.getElementById('addParamRowBtn');
const saveParamsBtn = document.getElementById('saveParamsBtn');
const closeParamEditorBtn = document.getElementById('closeParamEditorBtn');
const loadProcParamsBtn = document.getElementById('loadProcParamsBtn');
const paramProcInfo = document.getElementById('paramProcInfo');

function displayProcInfo(procName) {
  if (!paramProcInfo) return;
  if (procName) {
    paramProcInfo.innerHTML = 'Stored procedure: <strong>' + procName + '</strong>';
    paramProcInfo.style.color = '#1e293b';
    paramProcInfo.dataset.proc = procName;
  } else {
    paramProcInfo.innerHTML = 'Stored procedure: <strong>Not set</strong>';
    paramProcInfo.style.color = '#64748b';
    paramProcInfo.dataset.proc = '';
  }
}

function updateProcLoaderState() {
  if (!loadProcParamsBtn) return;
  const canLoad = !!currentStoredProcName;
  loadProcParamsBtn.disabled = !canLoad;
  loadProcParamsBtn.style.opacity = canLoad ? '1' : '0.5';
  loadProcParamsBtn.style.cursor = canLoad ? 'pointer' : 'not-allowed';
  loadProcParamsBtn.title = canLoad ? 'Pull parameters from ' + currentStoredProcName : 'Assign a stored procedure first.';
}

function renderParamRows(params) {
  if (!paramsEditorList) return;
  paramsEditorList.innerHTML = '';
  if (!params || params.length === 0) {
    paramsEditorList.innerHTML = '<div style=\"color:#666; font-size:13px;\">No parameters defined. Click "Add Parameter" or load them from the stored procedure.</div>';
    return;
  }
  params.forEach((p) => {
    const name = typeof p === 'string' ? p : (p && p.name) || '';
    const valuesQuery = typeof p === 'string' ? '' : (p && p.values_query) || '';
    const mode = typeof p === 'string' ? '' : (p && (p.mode || p.parameter_mode)) || '';
    const dtype = typeof p === 'string' ? '' : (p && (p.type || p.data_type)) || '';
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = 'minmax(140px, 1fr) minmax(220px, 2fr) auto';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    row.dataset.paramMode = mode || '';
    row.dataset.paramType = dtype || '';
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'Parameter name';
    nameInput.value = name;
    if (dtype || mode) {
      nameInput.title = (mode ? mode + ' • ' : '') + (dtype || '');
    }
    const queryContainer = document.createElement('div');
    queryContainer.style.display = 'flex';
    queryContainer.style.flexDirection = 'column';
    queryContainer.style.gap = '4px';
    const queryInput = document.createElement('input');
    queryInput.placeholder = 'Optional values_query (SQL)';
    queryInput.value = valuesQuery;
    const metaLabel = document.createElement('div');
    metaLabel.style.fontSize = '11px';
    metaLabel.style.color = '#64748b';
    metaLabel.style.display = (dtype || mode) ? 'block' : 'none';
    metaLabel.textContent = (mode ? mode + ' • ' : '') + (dtype || '');
    queryContainer.appendChild(queryInput);
    queryContainer.appendChild(metaLabel);
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'btn-secondary';
    removeBtn.onclick = () => { row.remove(); };
    row.appendChild(nameInput);
    row.appendChild(queryContainer);
    row.appendChild(removeBtn);
    paramsEditorList.appendChild(row);
  });
}

function collectParamRows() {
  const rows = [];
  if (!paramsEditorList) return rows;
  for (const child of Array.from(paramsEditorList.children)) {
    if (child.tagName !== 'DIV') continue;
    const inputs = child.querySelectorAll('input');
    if (!inputs || inputs.length < 1) continue;
    const name = inputs[0].value.trim().replace(/^@+/, '');
    if (!name) continue;
    const values_query = inputs[1] ? inputs[1].value.trim() : '';
    const mode = child.dataset ? (child.dataset.paramMode || '') : '';
    const dtype = child.dataset ? (child.dataset.paramType || '') : '';
    const payload = { name };
    if (values_query) payload.values_query = values_query;
    if (mode) payload.mode = mode;
    if (dtype) payload.type = dtype;
    if (Object.keys(payload).length === 1) rows.push(name);
    else rows.push(payload);
  }
  return rows;
}

function syncDefinitionParameterFields(params) {
  const jsonEl = document.getElementById('defParametersJson');
  if (jsonEl) jsonEl.value = JSON.stringify(params || []);
  const csvEl = document.getElementById('defParameters');
  if (csvEl) {
    csvEl.value = (params || []).map(p => typeof p === 'string' ? p : (p && p.name) || '').filter(Boolean).join(',');
  }
}

function mergeProcedureParameters(fetched, existing) {
  const existingMap = new Map();
  (existing || []).forEach((item) => {
    if (!item) return;
    if (typeof item === 'string') {
      existingMap.set(item.toLowerCase(), { name: item });
    } else if (typeof item === 'object') {
      const key = (item.name || '').toLowerCase();
      if (!key) return;
      existingMap.set(key, { ...item });
    }
  });
  const merged = [];
  const seen = new Set();
  (fetched || []).forEach((meta) => {
    if (!meta) return;
    const rawName = (meta.name || '').trim().replace(/^@+/, '');
    if (!rawName) return;
    const key = rawName.toLowerCase();
    seen.add(key);
    const existingItem = existingMap.get(key);
    if (existingItem) {
      const mergedItem = { ...existingItem, name: existingItem.name || rawName };
      if (meta.mode) mergedItem.mode = meta.mode;
      if (meta.type) mergedItem.type = meta.type;
      if (mergedItem.values_query) {
        merged.push(mergedItem);
      } else if (Object.keys(mergedItem).length === 1) {
        merged.push(mergedItem.name);
      } else {
        merged.push(mergedItem);
      }
    } else {
      const newItem = { name: rawName };
      if (meta.mode) newItem.mode = meta.mode;
      if (meta.type) newItem.type = meta.type;
      if (Object.keys(newItem).length === 1) merged.push(rawName);
      else merged.push(newItem);
    }
  });
  (existing || []).forEach((item) => {
    let name = '';
    if (typeof item === 'string') name = item;
    else if (item && typeof item === 'object') name = item.name || '';
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    merged.push(item);
  });
  return merged;
}

displayProcInfo(currentStoredProcName);
updateProcLoaderState();

if (editParamsBtn) {
  editParamsBtn.onclick = async () => {
    if (!currentDefId) {
      const msgEl = document.getElementById('defMsg');
      if (msgEl) msgEl.textContent = 'Select a definition first to edit parameters.';
      return;
    }
    const token = sessionStorage.getItem('token');
    try {
      const r = await fetch('/report/definitions/' + currentDefId, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to load definition'); }
      const def = await r.json();
      const params = def.parameters || [];
      currentStoredProcName = (def.stored_procedure || '').trim();
      displayProcInfo(currentStoredProcName);
      updateProcLoaderState();
      renderParamRows(params);
      syncDefinitionParameterFields(params);
      const editorMsg = document.getElementById('paramEditorMsg');
      if (editorMsg) { editorMsg.textContent = ''; editorMsg.style.color = '#475569'; }
      if (paramEditorModal) paramEditorModal.style.display = 'block';
    } catch (e) {
      const msgEl = document.getElementById('defMsg');
      if (msgEl) msgEl.textContent = 'Error loading definition: ' + e.message;
      currentStoredProcName = '';
      displayProcInfo('');
      updateProcLoaderState();
    }
  };
}

if (loadProcParamsBtn) {
  loadProcParamsBtn.onclick = async () => {
    if (!currentDefId) {
      const msgEl = document.getElementById('paramEditorMsg');
      if (msgEl) { msgEl.textContent = 'Save this report definition before loading parameters.'; msgEl.style.color = '#b91c1c'; }
      return;
    }
    if (!currentStoredProcName) {
      const msgEl = document.getElementById('paramEditorMsg');
      if (msgEl) { msgEl.textContent = 'Assign a stored procedure to this definition first.'; msgEl.style.color = '#b91c1c'; }
      return;
    }
    const msgEl = document.getElementById('paramEditorMsg');
    if (msgEl) { msgEl.textContent = 'Loading parameters from ' + currentStoredProcName + '...'; msgEl.style.color = '#0f172a'; }
    const token = sessionStorage.getItem('token');
    const previousLabel = loadProcParamsBtn.textContent;
    loadProcParamsBtn.textContent = 'Loading...';
    loadProcParamsBtn.disabled = true;
    loadProcParamsBtn.style.opacity = '0.5';
    try {
      const r = await fetch('/report/proc-parameters?name=' + encodeURIComponent(currentStoredProcName), { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || 'Failed to load parameters');
      const fetched = (data.parameters || []).map((p) => ({ name: p.name, mode: p.mode, type: p.type }));
      if (!fetched.length) {
        if (msgEl) { msgEl.textContent = 'No parameters were exposed for ' + currentStoredProcName + '.'; msgEl.style.color = '#b91c1c'; }
        return;
      }
      const existing = collectParamRows();
      const merged = mergeProcedureParameters(fetched, existing);
      renderParamRows(merged);
      syncDefinitionParameterFields(merged);
      if (msgEl) {
        msgEl.textContent = 'Loaded ' + fetched.length + ' parameter' + (fetched.length === 1 ? '' : 's') + ' from ' + currentStoredProcName + '. Review and click Save Parameters to persist.';
        msgEl.style.color = '#166534';
      }
    } catch (e) {
      if (msgEl) { msgEl.textContent = 'Failed to load procedure parameters: ' + e.message; msgEl.style.color = '#b91c1c'; }
    } finally {
      loadProcParamsBtn.textContent = previousLabel;
      updateProcLoaderState();
    }
  };
}

if (addParamRowBtn) addParamRowBtn.onclick = () => {
  const current = collectParamRows();
  renderParamRows(current.concat(['']));
};

if (saveParamsBtn) saveParamsBtn.onclick = () => {
  const arr = collectParamRows();
  const el = document.getElementById('defParametersJson');
  if (el) el.value = JSON.stringify(arr);
  const msgNode = document.getElementById('paramEditorMsg');
  if (msgNode) { msgNode.textContent = 'Parameters updated locally. Click Save Changes to persist.'; msgNode.style.color = '#0f172a'; }
  if (paramEditorModal) paramEditorModal.style.display = 'none';
};

// Enhance: immediately persist parameters to the server when saving from the editor
if (saveParamsBtn) {
  const originalHandler = saveParamsBtn.onclick;
  saveParamsBtn.onclick = async () => {
    try { originalHandler && originalHandler(); } catch (e) { /* ignore */ }
    if (!currentDefId) {
      return;
    }
    const token = sessionStorage.getItem('token');
    const msgEl = document.getElementById('paramEditorMsg');
    const paramsEl = document.getElementById('defParametersJson');
    let paramsPayload = [];
    if (paramsEl && paramsEl.value && paramsEl.value.trim()) {
      try { paramsPayload = JSON.parse(paramsEl.value); } catch (e) { if (msgEl) { msgEl.textContent = 'Invalid parameters JSON: ' + e.message; msgEl.style.color = '#b91c1c'; } return; }
    }
    let rn = (document.getElementById('defReportName') && document.getElementById('defReportName').value.trim()) || '';
    let sp = (document.getElementById('defStoredProc') && document.getElementById('defStoredProc').value.trim()) || '';
    let active = (document.getElementById('defActive') && document.getElementById('defActive').checked) || false;
    if (!rn || !sp) {
      try {
        const rdef = await fetch('/report/definitions/' + currentDefId, { headers: (token ? { 'Authorization': 'Bearer ' + token } : {}) });
        if (rdef.ok) {
          const j = await rdef.json();
          rn = rn || (j.report_name || '');
          sp = sp || (j.stored_procedure || '');
          active = typeof j.active !== 'undefined' ? j.active : active;
        }
      } catch (e) {
        // use whatever values we have
      }
    }
    const body = { report_name: rn, stored_procedure: sp, parameters: paramsPayload, active: active };
    try {
      const r = await fetch('/report/definitions/' + currentDefId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { 'Authorization': 'Bearer ' + token } : {}) },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        const t = await r.text();
        if (msgEl) { msgEl.textContent = 'Failed to save parameters: ' + t; msgEl.style.color = '#b91c1c'; }
        return;
      }
      try {
        const rd = await fetch('/report/definitions/' + currentDefId, { headers: (token ? { 'Authorization': 'Bearer ' + token } : {}) });
        if (rd.ok) {
          const jd = await rd.json();
          const paramsEl2 = document.getElementById('defParametersJson'); if (paramsEl2) paramsEl2.value = JSON.stringify(jd.parameters || []);
          const csvEl = document.getElementById('defParameters'); if (csvEl) csvEl.value = (jd.parameters||[]).map(p => (typeof p === 'string' ? p : (p.name||''))).filter(Boolean).join(',');
          if (msgEl) { msgEl.textContent = 'Parameters saved.'; msgEl.style.color = '#166534'; }
        } else {
          if (msgEl) { msgEl.textContent = 'Parameters saved (server did not return updated definition).'; msgEl.style.color = '#166534'; }
        }
      } catch (e) {
        if (msgEl) { msgEl.textContent = 'Parameters saved, but failed to refresh: ' + e.message; msgEl.style.color = '#ca8a04'; }
      }
      try { loadReportDefinitions(); } catch (e) { /* ignore */ }
    } catch (e) {
      if (msgEl) { msgEl.textContent = 'Error saving parameters: ' + e.message; msgEl.style.color = '#b91c1c'; }
    }
  };
}

if (closeParamEditorBtn) closeParamEditorBtn.onclick = () => {
  if (paramEditorModal) paramEditorModal.style.display = 'none';
};

// Close editor when clicking outside
if (paramEditorModal) {
  window.addEventListener('click', (event) => {
    if (event.target === paramEditorModal) paramEditorModal.style.display = 'none';
  });
}

if (closeImportBtn && importModal) {
  closeImportBtn.onclick = () => {
    importModal.style.display = 'none';
  };
}

// Close modal when clicking outside
if (importModal) {
  window.addEventListener('click', (event) => {
    if (event.target === importModal) {
      importModal.style.display = 'none';
    }
  });
}

// Refresh tables button
const refreshTablesBtn = document.getElementById('refreshTablesBtn');
if (refreshTablesBtn) {
  refreshTablesBtn.onclick = loadTables;
}

// Import button with table selection
const importBtn = document.getElementById('importBtn');
if (importBtn) {
  importBtn.onclick = async () => {
    const files = document.getElementById('fileInput').files;
    const tableName = document.getElementById('tableSelect').value;
    const msgEl = document.getElementById('importMsg');
    
    if (!tableName) {
      msgEl.innerText = 'Please select a table first';
      msgEl.style.color = 'red';
      return;
    }
    
    if (!files.length) {
      msgEl.innerText = 'Please choose files to import';
      msgEl.style.color = 'red';
      return;
    }
    
    msgEl.innerText = '⏳ Importing data, please wait...\nThis may take a moment for large files.';
    msgEl.style.whiteSpace = 'pre-line';
    msgEl.style.color = 'blue';
    
    const sheetNameVal = document.getElementById('sheetName').value.trim();
    const token = sessionStorage.getItem('token');
    
    // Helper function to perform import with optional duplicate_action
    async function doImport(duplicateAction = null) {
      const importFd = new FormData();
      for (let f of files) importFd.append('files', f);
      if (tableName === '__CREATE_NEW__') {
        importFd.append('create_new', 'true');
      } else {
        importFd.append('table_name', tableName);
      }
      if (sheetNameVal) {
        importFd.append('sheet_name', sheetNameVal);
      }
      if (duplicateAction) {
        importFd.append('duplicate_action', duplicateAction);
      }
      
      return fetch('/import-data', {
        method: 'POST',
        body: importFd,
        headers: token ? {'Authorization': 'Bearer ' + token} : {}
      });
    }
    
    // Helper to handle import response after duplicate action
    async function handleImportResponse(res) {
      if (res.ok) {
        const j = await res.json();
        handleImportSuccess(j);
      } else {
        const err = await res.text();
        msgEl.innerText = '✗ Import Failed: ' + err;
        msgEl.style.color = 'red';
      }
    }
    
    // Helper to show success message
    function handleImportSuccess(j) {
      let successMsg = `✓ Import Successful!\n\n`;
      successMsg += `📊 Rows Imported: ${j.rows_imported}\n`;
      
      if (j.details && j.details.length > 0) {
        const successfulFiles = j.details.filter(d => d.success);
        if (successfulFiles.length > 0) {
          successMsg += `📁 Files Processed: ${successfulFiles.length}\n`;
          successfulFiles.forEach(f => {
            successMsg += `   • ${f.file}: ${f.rows} rows → ${f.table} (ID: ${f.import_log_id ?? 'N/A'})\n`;
          });
          if (j.import_log_ids && j.import_log_ids.length) {
            successMsg += `🆔 Import Log IDs: ${j.import_log_ids.join(', ')}\n`;
          }
        }
      }
      
      msgEl.innerText = successMsg;
      msgEl.style.color = 'green';
      msgEl.style.whiteSpace = 'pre-line';
      
      // Clear file input
      document.getElementById('fileInput').value = '';
      
      // Reload tables to show newly imported data
      loadTables();
      
      // Reload dashboard summary to update statistics
      if (typeof loadDashboardSummary === 'function') {
        loadDashboardSummary();
      }
      
      // Close modal after 3 seconds
      setTimeout(() => {
        importModal.style.display = 'none';
      }, 3000);
    }
    
    try {
      const res = await doImport();
      
      if (res.ok) {
        const j = await res.json();
        
        // Check if any duplicates were detected that need user decision
        const duplicates = (j.details || []).filter(d => d.duplicate && d.options);
        
        if (duplicates.length > 0) {
          // Show duplicate dialog with options
          const dup = duplicates[0];
          const importedAt = dup.duplicate_info?.imported_at ? new Date(dup.duplicate_info.imported_at).toLocaleString() : 'unknown';
          msgEl.innerHTML = `
            <div style="background:#fff3cd; border:1px solid #ffc107; border-radius:8px; padding:16px; margin-bottom:12px;">
              <strong style="color:#856404;">⚠️ Duplicate File Detected</strong>
              <p style="margin:10px 0; color:#856404;">${dup.message}</p>
              <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:12px;">
                <button id="dupAppendBtn" style="padding:8px 16px; background:#28a745; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                  ➕ Append to Existing
                </button>
                <button id="dupOverwriteBtn" style="padding:8px 16px; background:#dc3545; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                  🔄 Overwrite Table
                </button>
                <button id="dupSkipBtn" style="padding:8px 16px; background:#6c757d; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600;">
                  ⏭️ Skip This File
                </button>
              </div>
              <p style="font-size:12px; color:#666; margin-top:10px;">
                Previous import: ${dup.duplicate_info?.rows_imported || 0} rows on ${importedAt}
              </p>
            </div>
          `;
          
          // Wire up buttons
          document.getElementById('dupAppendBtn').onclick = async () => {
            msgEl.innerText = '⏳ Appending data to existing table...';
            msgEl.style.color = 'blue';
            const appendRes = await doImport('append');
            handleImportResponse(appendRes);
          };
          
          document.getElementById('dupOverwriteBtn').onclick = async () => {
            msgEl.innerText = '⏳ Overwriting table with new data...';
            msgEl.style.color = 'blue';
            const overwriteRes = await doImport('overwrite');
            handleImportResponse(overwriteRes);
          };
          
          document.getElementById('dupSkipBtn').onclick = async () => {
            msgEl.innerText = '⏭️ File skipped. No changes made.';
            msgEl.style.color = '#6c757d';
          };
          
          return; // Wait for user action
        }
        
        // No duplicates, show success
        handleImportSuccess(j);
      } else {
        const err = await res.text();
        let errorMsg = '✗ Import Failed\n\n';
        try {
          const errorJson = JSON.parse(err);
          errorMsg += errorJson.detail || err;
        } catch {
          errorMsg += err;
        }
        msgEl.innerText = errorMsg;
        msgEl.style.color = 'red';
        msgEl.style.whiteSpace = 'pre-line';
      }
    } catch (e) {
      msgEl.innerText = 'Import error: ' + e.message;
      msgEl.style.color = 'red';
    }
  }
}

// Preview import (first rows/columns) without persisting
const previewImportBtn = document.getElementById('previewImportBtn');
const previewModal = document.getElementById('previewModal');
const closePreviewBtn = document.getElementById('closePreviewBtn');

if (closePreviewBtn && previewModal) {
  closePreviewBtn.onclick = () => {
    previewModal.style.display = 'none';
  };
}

if (previewModal) {
  window.addEventListener('click', (event) => {
    if (event.target === previewModal) {
      previewModal.style.display = 'none';
    }
  });
}

if (previewImportBtn) {
  previewImportBtn.onclick = async () => {
    const files = document.getElementById('fileInput').files;
    const sheetNameVal = document.getElementById('sheetName').value.trim();
    const msgEl = document.getElementById('importMsg');
    const previewContentEl = document.getElementById('previewContent');

    if (previewContentEl) previewContentEl.innerHTML = '';

    if (!files.length) {
      msgEl.innerText = '⚠ Please select a file first to generate preview';
      msgEl.style.color = '#ff9800';
      msgEl.style.whiteSpace = 'pre-line';
      return;
    }

    // Only preview first selected file
    const file = files[0];
    const fd = new FormData();
    fd.append('file', file);
    if (sheetNameVal) fd.append('sheet_name', sheetNameVal);
    fd.append('max_rows', '20');

    msgEl.innerText = '⏳ Generating preview, please wait...';
    msgEl.style.color = '#0066cc';
    msgEl.style.whiteSpace = 'pre-line';

    const token = sessionStorage.getItem('token');
    try {
      const res = await fetch('/import-preview', {
        method: 'POST',
        body: fd,
        headers: token ? { 'Authorization': 'Bearer ' + token } : {}
      });

      if (!res.ok) {
        const errTxt = await res.text();
        msgEl.innerText = 'Preview failed: ' + errTxt;
        msgEl.style.color = 'red';
        return;
      }

      const data = await res.json();
      const cols = data.columns || [];
      const rows = data.rows || [];

      msgEl.innerText = `Preview ready (${rows.length} rows)`;
      msgEl.style.color = 'green';

      if (!cols.length) {
        if (previewContentEl) previewContentEl.innerText = 'No columns detected in file.';
        if (previewModal) previewModal.style.display = 'block';
        return;
      }

      let html = `<div style="margin-bottom: 10px; padding: 10px; background: #f8f9fa; border-radius: 6px;">`;
      html += `<strong>File:</strong> ${file.name}<br>`;
      html += `<strong>Columns:</strong> ${cols.length}<br>`;
      html += `<strong>Preview Rows:</strong> ${rows.length} of ${data.row_count || rows.length}`;
      html += `</div>`;
      html += '<table style="width:100%; border-collapse:collapse; font-size: 14px;">';
      html += '<thead><tr>';
      for (const c of cols) {
        html += `<th style="border:1px solid #ddd; padding:8px; text-align:left; background:#667eea; color: white; font-weight: 600; position: sticky; top: 0;">${c}</th>`;
      }
      html += '</tr></thead><tbody>';
      for (const r of rows) {
        html += '<tr>';
        for (const c of cols) {
          const v = (r[c] !== undefined && r[c] !== null) ? r[c] : '';
          html += `<td style="border:1px solid #eee; padding:8px; font-family:Consolas, monospace; font-size:13px;">${v}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      
      if (previewContentEl) previewContentEl.innerHTML = html;
      if (previewModal) previewModal.style.display = 'block';
    } catch (e) {
      msgEl.innerText = 'Preview error: ' + e.message;
      msgEl.style.color = 'red';
    }
  };
}

// Power BI Viewer
const showPowerBIBtn = document.getElementById('showPowerBIBtn');
const powerbiModal = document.getElementById('powerbiModal');
const closePowerBIBtn = document.getElementById('closePowerBIBtn');
const tabWebDashboard = document.getElementById('tabWebDashboard');
const tabLocalFiles = document.getElementById('tabLocalFiles');
const webDashboardContent = document.getElementById('webDashboardContent');
const localFilesContent = document.getElementById('localFilesContent');

// Tab switching
if (tabWebDashboard && tabLocalFiles) {
  tabWebDashboard.onclick = () => {
    tabWebDashboard.classList.add('active');
    tabWebDashboard.style.color = '#667eea';
    tabWebDashboard.style.borderBottom = '3px solid #667eea';
    tabLocalFiles.classList.remove('active');
    tabLocalFiles.style.color = '#999';
    tabLocalFiles.style.borderBottom = '3px solid transparent';
    webDashboardContent.style.display = 'block';
    localFilesContent.style.display = 'none';
  };
  
  tabLocalFiles.onclick = () => {
    tabLocalFiles.classList.add('active');
    tabLocalFiles.style.color = '#667eea';
    tabLocalFiles.style.borderBottom = '3px solid #667eea';
    tabWebDashboard.classList.remove('active');
    tabWebDashboard.style.color = '#999';
    tabWebDashboard.style.borderBottom = '3px solid transparent';
    localFilesContent.style.display = 'block';
    webDashboardContent.style.display = 'none';
    loadLocalPowerBIFiles();
  };
}

async function loadLocalPowerBIFiles() {
  const listEl = document.getElementById('localFilesList');
  if (!listEl) return;
  
  listEl.innerHTML = '<div style="text-align: center; color: #999;">Loading...</div>';
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/powerbi/local-files', {
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    
    if (res.ok) {
      const data = await res.json();
      
      if (data.files.length === 0) {
        listEl.innerHTML = `
          <div style="text-align: center; color: #999; padding: 40px;">
            <span style="font-size: 48px; opacity: 0.3;">📂</span>
            <p style="margin-top: 10px;">No Power BI files found in application directory</p>
            <p style="font-size: 12px; color: #aaa;">Place .pbix files in the ReportApp folder</p>
          </div>
        `;
        return;
      }
      
      let html = '<div style="display: grid; gap: 12px;">';
      data.files.forEach(file => {
        html += `
          <div style="background: white; padding: 16px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #333; margin-bottom: 4px;">📊 ${file.name}</div>
              <div style="font-size: 12px; color: #999;">
                ${file.relative_path} • ${file.size_mb} MB • Modified: ${new Date(file.modified).toLocaleString()}
              </div>
            </div>
            <button onclick="openLocalPowerBI('${file.path.replace(/\\/g, '\\\\')}')" 
                    style="padding: 8px 16px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; white-space: nowrap;">
              🚀 Open in Power BI Desktop
            </button>
          </div>
        `;
      });
      html += '</div>';
      listEl.innerHTML = html;
    } else {
      listEl.innerHTML = '<div style="text-align: center; color: red;">Failed to load Power BI files</div>';
    }
  } catch (e) {
    listEl.innerHTML = '<div style="text-align: center; color: red;">Error: ' + e.message + '</div>';
  }
}

async function openLocalPowerBI(filePath) {
  try {
    const token = sessionStorage.getItem('token');
    const fd = new FormData();
    fd.append('file_path', filePath);
    
    const res = await fetch('/powerbi/open-local', {
      method: 'POST',
      body: fd,
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    
    if (res.ok) {
      const data = await res.json();
      showNotification(data.message, 'success');
    } else {
      const err = await res.text();
      showNotification('Failed to open file: ' + err, 'error');
    }
  } catch (e) {
    showNotification('Error: ' + e.message, 'error');
  }
}

const refreshLocalFilesBtn = document.getElementById('refreshLocalFilesBtn');
if (refreshLocalFilesBtn) {
  refreshLocalFilesBtn.onclick = loadLocalPowerBIFiles;
}
// Redirect Power BI button to standalone page
if (showPowerBIBtn) {
  showPowerBIBtn.onclick = () => { navigateTo('/powerbi'); };
}

if (closePowerBIBtn && powerbiModal) {
  closePowerBIBtn.onclick = () => {
    powerbiModal.style.display = 'none';
    document.getElementById('powerbiIframe').src = ''; // Stop loading
  };
}

if (powerbiModal) {
  window.addEventListener('click', (event) => {
    if (event.target === powerbiModal) {
      powerbiModal.style.display = 'none';
      document.getElementById('powerbiIframe').src = '';
    }
  });
}

// Power BI Settings (Admin Only) - Multi-Report Management
const showPowerBISettingsBtn = document.getElementById('showPowerBISettingsBtn');
const powerbiSettingsModal = document.getElementById('powerbiSettingsModal');
const closePowerBISettingsBtn = document.getElementById('closePowerBISettingsBtn');
const addPowerBIReportBtn = document.getElementById('addPowerBIReportBtn');

// Load and display reports list
async function loadPowerBIReportsList() {
  const listEl = document.getElementById('powerbiReportsList');
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/powerbi/reports', {
      headers: token ? {'Authorization': 'Bearer ' + token} : {}
    });
    
    if (res.ok) {
      const data = await res.json();
      const reports = data.reports || [];
      
      if (reports.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No reports configured yet. Add one using the form above.</div>';
      } else {
        listEl.innerHTML = reports.map(r => `
          <div style="background: white; padding: 12px; margin-bottom: 10px; border-radius: 6px; border-left: 4px solid #667eea; display: flex; justify-content: space-between; align-items: center;">
            <div style="flex: 1;">
              <div style="font-weight: 600; color: #333;">${r.name || 'Unnamed'}</div>
              <div style="font-size: 12px; color: #999; margin-top: 4px; word-break: break-all;">${r.embed_url}</div>
              <div style="font-size: 12px; color: #666; margin-top: 4px;">
                ${r.show_filter_pane ? '✓ Filter' : ''}
                ${r.show_nav_pane ? ' ✓ Nav' : ''}
                ${r.allow_fullscreen ? ' ✓ Fullscreen' : ''}
              </div>
            </div>
            <button onclick="deletePowerBIReport(${r.id})" class="btn-secondary" style="padding: 6px 12px; margin: 0; margin-left: 10px; background: #d32f2f; color: white;">Delete</button>
          </div>
        `).join('');
      }
    } else {
      listEl.innerHTML = '<div style="text-align: center; color: red;">Failed to load reports</div>';
    }
  } catch (e) {
    console.error('Error loading reports:', e);
    listEl.innerHTML = '<div style="text-align: center; color: red;">Error: ' + e.message + '</div>';
  }
}

// Delete a Power BI report
async function deletePowerBIReport(reportId) {
  if (!confirm('Are you sure you want to delete this report?')) return;
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/powerbi/reports/${reportId}`, {
      method: 'DELETE',
      headers: {'Authorization': 'Bearer ' + token}
    });
    
    if (res.ok) {
      showNotification('Report deleted successfully', 'success');
      loadPowerBIReportsList(); // Reload list
    } else {
      const err = await res.text();
      showNotification('Error: ' + err, 'error');
    }
  } catch (e) {
    showNotification('Error: ' + e.message, 'error');
  }
}

if (showPowerBISettingsBtn && powerbiSettingsModal) {
  showPowerBISettingsBtn.onclick = async () => {
    powerbiSettingsModal.style.display = 'block';
    document.getElementById('powerbiAddMsg').innerText = '';
    
    // Clear form
    document.getElementById('powerbiReportName').value = '';
    document.getElementById('powerbiEmbedUrl').value = '';
    document.getElementById('powerbiShowFilterPane').checked = true;
    document.getElementById('powerbiShowNavPane').checked = true;
    document.getElementById('powerbiAllowFullscreen').checked = true;
    
    // Load reports list
    await loadPowerBIReportsList();
  };
}

if (closePowerBISettingsBtn && powerbiSettingsModal) {
  closePowerBISettingsBtn.onclick = () => {
    powerbiSettingsModal.style.display = 'none';
  };
}

if (addPowerBIReportBtn) {
  addPowerBIReportBtn.onclick = async () => {
    const name = document.getElementById('powerbiReportName').value;
    const embedUrl = document.getElementById('powerbiEmbedUrl').value;
    const showFilterPane = document.getElementById('powerbiShowFilterPane').checked;
    const showNavPane = document.getElementById('powerbiShowNavPane').checked;
    const allowFullscreen = document.getElementById('powerbiAllowFullscreen').checked;
    const msgEl = document.getElementById('powerbiAddMsg');
    
    if (!name) {
      msgEl.innerText = 'Report name is required';
      msgEl.style.color = 'red';
      return;
    }
    
    if (!embedUrl) {
      msgEl.innerText = 'Embed URL is required';
      msgEl.style.color = 'red';
      return;
    }
    
    msgEl.innerText = 'Adding report...';
    msgEl.style.color = '#666';
    
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/powerbi/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          title: name,
          embed_url: embedUrl,
          show_filter_pane: showFilterPane,
          show_nav_pane: showNavPane,
          allow_fullscreen: allowFullscreen,
          enabled: true
        })
      });
      
      if (res.ok) {
        const j = await res.json();
        msgEl.innerText = '✓ Report added successfully!';
        msgEl.style.color = 'green';
        
        // Clear form
        document.getElementById('powerbiReportName').value = '';
        document.getElementById('powerbiEmbedUrl').value = '';
        document.getElementById('powerbiShowFilterPane').checked = true;
        document.getElementById('powerbiShowNavPane').checked = true;
        document.getElementById('powerbiAllowFullscreen').checked = true;
        
        // Reload list
        await loadPowerBIReportsList();
        
        showNotification('Power BI report added successfully!', 'success');
      } else {
        const err = await res.text();
        msgEl.innerText = 'Error: ' + err;
        msgEl.style.color = 'red';
      }
    } catch (e) {
      msgEl.innerText = 'Error: ' + e.message;
      msgEl.style.color = 'red';
    }
  };
}

if (powerbiSettingsModal) {
  window.addEventListener('click', (event) => {
    if (event.target === powerbiSettingsModal) {
      powerbiSettingsModal.style.display = 'none';
    }
  });
}

document.getElementById('runBtn').onclick = async () => {
  const name = document.getElementById('reportName').value || 'default';
  const fd = new FormData();
  fd.append('report_name', name);
  const res = await fetch('/run-report', {method:'POST', body: fd});
  const j = await res.json();
  document.getElementById('output').innerText = JSON.stringify(j, null, 2);
}

// Redirect to dedicated login page if not authenticated
(function initApp(){
  try {
    const token = sessionStorage.getItem('token');
    if (!token) {
      // No token: use the dedicated login page that contains DB settings
      window.location.href = '/login';
      return;
    }
    // Token exists: show main UI and load DB info panel
    showMain();
    // Safe to call; updates connection info in the modal if present
    if (typeof loadDbInfo === 'function') {
      loadDbInfo();
    }
    // Update banner if present on dashboard
    updateDbBanner();
    // Load dashboard summary metrics
    loadDashboardSummary();
    // Also load recent activity explicitly (in case summary fails)
    if (typeof loadRecentActivity === 'function') {
      loadRecentActivity();
    }
  } catch (e) {
    console.error('Init error:', e);
  }
})();

// Change Password modal wiring
const changePwdModal = document.getElementById('changePwdModal');
const savePwdBtn = document.getElementById('savePwdBtn');
const cancelPwdBtn = document.getElementById('cancelPwdBtn');
if (cancelPwdBtn && changePwdModal) {
  cancelPwdBtn.onclick = () => { changePwdModal.style.display = 'none'; };
}
if (savePwdBtn) {
  savePwdBtn.onclick = async () => {
    const msg = document.getElementById('changePwdMsg');
    const p1 = document.getElementById('newPwd').value;
    const p2 = document.getElementById('newPwd2').value;
    if (!p1 || p1.length < 6) { msg.textContent = 'Password must be at least 6 characters'; msg.style.color = 'red'; return; }
    if (p1 !== p2) { msg.textContent = 'Passwords do not match'; msg.style.color = 'red'; return; }
    msg.textContent = 'Updating password...'; msg.style.color = '#666';
    try {
      const fd = new FormData();
      fd.append('new_password', p1);
      const token = sessionStorage.getItem('token');
      const r = await fetch('/me/change-password', { method: 'POST', body: fd, headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
      if (!r.ok) { const t = await r.text(); msg.textContent = 'Failed: ' + t; msg.style.color = 'red'; return; }
      msg.textContent = '✓ Password updated successfully'; msg.style.color = 'green';
      sessionStorage.removeItem('forceChangePassword');
      setTimeout(() => { if (changePwdModal) changePwdModal.style.display = 'none'; }, 800);
    } catch (e) {
      msg.textContent = 'Error: ' + e.message; msg.style.color = 'red';
    }
  };
}

// ========== User Permissions Management ==========
const PERMISSION_KEYS = ['import_data', 'create_table', 'delete_table', 'run_reports', 'view_powerbi', 'manage_reports', 'view_dashboard'];

async function loadAllPermissions() {
  const loading = document.getElementById('permissionsLoading');
  const table = document.getElementById('permissionsTable');
  const tbody = document.getElementById('permissionsTableBody');
  const msg = document.getElementById('permissionsMsg');
  
  if (loading) loading.style.display = 'block';
  if (table) table.style.display = 'none';
  if (msg) msg.textContent = '';
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/permissions/all-users', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to load permissions');
    }
    
    const data = await res.json();
    const users = data.users || [];
    
    if (tbody) {
      tbody.innerHTML = '';
      
      users.forEach(user => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #e2e8f0';
        
        // Username
        const tdUser = document.createElement('td');
        tdUser.style.padding = '10px 12px';
        tdUser.style.fontWeight = '500';
        tdUser.textContent = user.username;
        row.appendChild(tdUser);
        
        // Role
        const tdRole = document.createElement('td');
        tdRole.style.padding = '10px 12px';
        tdRole.innerHTML = user.is_admin 
          ? '<span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:4px; font-size:11px;">Admin</span>'
          : '<span style="background:#e0e7ff; color:#3730a3; padding:2px 8px; border-radius:4px; font-size:11px;">User</span>';
        row.appendChild(tdRole);
        
        // Permission checkboxes
        PERMISSION_KEYS.forEach(perm => {
          const td = document.createElement('td');
          td.style.padding = '10px 12px';
          td.style.textAlign = 'center';
          
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.checked = user.permissions[perm] === true;
          checkbox.disabled = user.is_admin; // Admins always have all permissions
          checkbox.style.width = '18px';
          checkbox.style.height = '18px';
          checkbox.style.cursor = user.is_admin ? 'not-allowed' : 'pointer';
          
          if (!user.is_admin) {
            checkbox.onchange = async () => {
              await updateUserPermission(user.user_id, perm, checkbox.checked);
            };
          }
          
          td.appendChild(checkbox);
          row.appendChild(td);
        });
        
        tbody.appendChild(row);
      });
    }
    
    if (loading) loading.style.display = 'none';
    if (table) table.style.display = 'block';
    
  } catch (e) {
    if (loading) loading.style.display = 'none';
    if (msg) {
      msg.textContent = '❌ ' + e.message;
      msg.style.color = '#dc2626';
    }
  }
}

async function updateUserPermission(userId, permissionName, granted) {
  const msg = document.getElementById('permissionsMsg');
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch(`/permissions/user/${userId}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ permission_name: permissionName, granted: granted })
    });
    
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to update permission');
    }
    
    const data = await res.json();
    if (msg) {
      msg.textContent = '✓ ' + data.message;
      msg.style.color = '#16a34a';
      setTimeout(() => { if (msg) msg.textContent = ''; }, 3000);
    }
    
  } catch (e) {
    if (msg) {
      msg.textContent = '❌ ' + e.message;
      msg.style.color = '#dc2626';
    }
    // Reload to reset checkbox states
    loadAllPermissions();
  }
}

// Wire up permissions modal
document.addEventListener('DOMContentLoaded', () => {
  const showPermissionsBtn = document.getElementById('showPermissionsBtn');
  const permissionsModal = document.getElementById('permissionsModal');
  const closePermissionsBtn = document.getElementById('closePermissionsBtn');
  
  if (showPermissionsBtn && permissionsModal) {
    showPermissionsBtn.onclick = () => {
      permissionsModal.style.display = 'block';
      loadAllPermissions();
    };
  }
  
  if (closePermissionsBtn && permissionsModal) {
    closePermissionsBtn.onclick = () => {
      permissionsModal.style.display = 'none';
    };
  }
  
  // Close modal when clicking outside
  if (permissionsModal) {
    permissionsModal.onclick = (e) => {
      if (e.target === permissionsModal) {
        permissionsModal.style.display = 'none';
      }
    };
  }
});
