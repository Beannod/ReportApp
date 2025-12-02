// Loads the list of report definitions into the modal
let currentDefId = null;
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
  // Patch: open modal and load definitions
  if (showReportDefsBtn && reportDefsModal) {
    showReportDefsBtn.onclick = () => {
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
    const msg = document.getElementById('defMsg');
    if (msg) msg.textContent='New definition';
  };
});
async function postJson(url, payload){
  const r = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
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
  notification.style.zIndex = '10000';
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
  document.getElementById('mainSection').style.display = 'block';
  const username = sessionStorage.getItem('username');
  const role = sessionStorage.getItem('role');
  if (username) {
    document.getElementById('currentUser').innerText = username;
  }
  if (role === 'admin') {
    document.getElementById('adminSection').style.display = 'block';
    loadUsers();
  }
  // Show admin header controls (moved Report DB Settings button) for admins
  const adminHeader = document.getElementById('adminHeaderControls');
  if (adminHeader) {
    if (role === 'admin') adminHeader.style.display = 'flex'; else adminHeader.style.display = 'none';
  }
  // If forced password change is pending, open modal
  const force = sessionStorage.getItem('forceChangePassword');
  if (force === '1') {
    const modal = document.getElementById('changePwdModal');
    if (modal) modal.style.display = 'block';
  }
}

const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) logoutBtn.onclick = () => { sessionStorage.clear(); location.reload(); }

// Quick actions navigation
const goReportBtn = document.getElementById('showReportBtn');
if (goReportBtn) {
  goReportBtn.onclick = () => {
    window.location.href = '/report';
  };
}

const goPowerBIBtn = document.getElementById('showPowerBIBtn');
if (goPowerBIBtn) {
  goPowerBIBtn.onclick = () => {
    window.location.href = '/powerbi';
  };
}

// Legacy dashboard Run button -> redirect to new page
const legacyRunBtn = document.getElementById('runBtn');
if (legacyRunBtn) {
  legacyRunBtn.onclick = () => { window.location.href = '/report'; };
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
    status.textContent = 'Testing report DB connection...'; status.style.color = '#666';
    try {
      const token = sessionStorage.getItem('token');
      const r = await fetch('/report/db/diag', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
      const data = await r.json();
      if (r.ok) {
        status.textContent = `Connected. Using DB: ${data.using_database || '(unknown)'} • Tables: ${data.tables_count}`;
        status.style.color = '#2e7d32';
      } else {
        let msg = 'Failed: ' + (data.detail || JSON.stringify(data));
        if (data.available_databases && Array.isArray(data.available_databases)) {
          msg += `\nAvailable: ${data.available_databases.join(', ')}`;
        }
        status.textContent = msg;
        status.style.color = '#c62828';
      }
    } catch (e) {
      status.textContent = 'Error: ' + e.message; status.style.color = '#c62828';
    }
  };
}

  // Test runtime DB connectivity using /report/db/diag/runtime
  const testRuntimeDbBtn = document.getElementById('testRuntimeDbBtn');
  if (testRuntimeDbBtn) {
    testRuntimeDbBtn.onclick = async () => {
      const status = document.getElementById('runtimeDbStatus');
      status.textContent = 'Testing runtime DB connection...'; status.style.color = '#666';
      try {
        const token = sessionStorage.getItem('token');
        const r = await fetch('/report/db/diag/runtime', { headers: token ? { 'Authorization': 'Bearer ' + token } : {} });
        const data = await r.json();
        if (r.ok) {
          status.textContent = `Connected. Using DB: ${data.using_database || '(unknown)'} • Tables: ${data.tables_count}`;
          status.style.color = '#2e7d32';
        } else {
          let msg = 'Failed: ' + (data.detail || JSON.stringify(data));
          if (data.available_databases && Array.isArray(data.available_databases)) {
            msg += `\nAvailable: ${data.available_databases.join(', ')}`;
          }
          status.textContent = msg;
          status.style.color = '#c62828';
        }
      } catch (e) {
        status.textContent = 'Error: ' + e.message; status.style.color = '#c62828';
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

// Create User Modal Controls
const showCreateUserBtn = document.getElementById('showCreateUserBtn');
const createUserModal = document.getElementById('createUserModal');
const closeCreateUserBtn = document.getElementById('closeCreateUserBtn');

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
        
        // Close modal after 1 second
        setTimeout(() => {
          createUserModal.style.display = 'none';
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
  try {
    const usersEl = document.getElementById('summaryUsers');
    const impEl = document.getElementById('summaryImports');
    const impLastEl = document.getElementById('summaryImportsLast');
    const repEl = document.getElementById('summaryReports');
    const repLastEl = document.getElementById('summaryReportsLast');
    const tablesEl = document.getElementById('summaryTables');
    if (!usersEl || !impEl || !repEl) return;

    const token = sessionStorage.getItem('token');
    const res = await fetch('/dashboard/summary', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    if (!res.ok) {
      // Graceful fallback when SQL Server not configured/available or server error
      usersEl.textContent = '0';
      impEl.textContent = '0';
      repEl.textContent = '0';
      if (tablesEl) tablesEl.textContent = '0';
      if (impLastEl) impLastEl.textContent = 'Configure SQL Server to enable statistics';
      if (repLastEl) repLastEl.textContent = 'Configure SQL Server to enable statistics';
      return;
    }
    const data = await res.json();

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
  const activityEl = document.getElementById('recentActivity');
  if (!activityEl) return;
  
  try {
    const token = sessionStorage.getItem('token');
    const res = await fetch('/recent-activity', {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {}
    });
    
    if (!res.ok) {
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

if (showImportBtn && importModal) {
  showImportBtn.onclick = () => {
    importModal.style.display = 'block';
    document.getElementById('importMsg').innerText = '';
    document.getElementById('fileInput').value = '';
    if (sheetNameSelect) sheetNameSelect.innerHTML = '<option value="">-- Select a file first --</option>';
    loadTables();
  };
}

// User import button (for non-admin users)
const showImportBtnUser = document.getElementById('showImportBtnUser');
if (showImportBtnUser && importModal) {
  showImportBtnUser.onclick = () => {
    importModal.style.display = 'block';
    document.getElementById('importMsg').innerText = '';
    document.getElementById('fileInput').value = '';
    if (sheetNameSelect) sheetNameSelect.innerHTML = '<option value="">-- Select a file first --</option>';
    loadTables();
  };
}

// Report button (for all users)
const showReportBtn = document.getElementById('showReportBtn');
if (showReportBtn) {
  showReportBtn.onclick = () => {
    window.location.href = 'report.html';
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

function renderParamRows(params) {
  if (!paramsEditorList) return;
  paramsEditorList.innerHTML = '';
  if (!params || params.length === 0) {
    paramsEditorList.innerHTML = '<div style="color:#666; font-size:13px;">No parameters defined. Click "Add Parameter" to create one.</div>';
    return;
  }
  params.forEach((p, idx) => {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 2fr auto';
    row.style.gap = '8px';
    row.style.alignItems = 'center';
    const nameInput = document.createElement('input');
    nameInput.placeholder = 'name (e.g., p_city)';
    nameInput.value = typeof p === 'string' ? p : (p.name || '');
    const queryInput = document.createElement('input');
    queryInput.placeholder = 'Optional values_query (SQL)';
    queryInput.value = typeof p === 'string' ? '' : (p.values_query || '');
    const removeBtn = document.createElement('button');
    removeBtn.textContent = 'Remove';
    removeBtn.className = 'btn-secondary';
    removeBtn.onclick = () => { row.remove(); };
    row.appendChild(nameInput);
    row.appendChild(queryInput);
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
    // Normalize name: trim and remove leading @ characters
    const name = inputs[0].value.trim().replace(/^@+/, '');
    const values_query = inputs[1] ? inputs[1].value.trim() : '';
    if (!name) continue;
    if (values_query) rows.push({ name, values_query }); else rows.push(name);
  }
  return rows;
}

if (editParamsBtn) {
  editParamsBtn.onclick = async () => {
    if (!currentDefId) {
      document.getElementById('defMsg').textContent = 'Select a definition first to edit parameters.';
      return;
    }
    // Load full definition from API to get structured parameters
    const token = sessionStorage.getItem('token');
    try {
      const r = await fetch('/report/definitions/' + currentDefId, { headers: { 'Authorization': 'Bearer ' + token } });
      if (!r.ok) { const t = await r.text(); throw new Error(t || 'Failed to load definition'); }
      const def = await r.json();
      const params = def.parameters || [];
      renderParamRows(params);
      if (paramEditorModal) paramEditorModal.style.display = 'block';
    } catch (e) {
      document.getElementById('defMsg').textContent = 'Error loading definition: ' + e.message;
    }
  };
}

if (addParamRowBtn) addParamRowBtn.onclick = () => {
  // append an empty row
  renderParamRows(collectParamRows().concat(['']));
};

if (saveParamsBtn) saveParamsBtn.onclick = () => {
  const arr = collectParamRows();
  // store JSON into hidden textarea for save handler to pick up
  const el = document.getElementById('defParametersJson');
  if (el) el.value = JSON.stringify(arr);
  document.getElementById('paramEditorMsg').textContent = 'Parameters updated locally. Click Save Changes to persist.';
  // close editor
  if (paramEditorModal) paramEditorModal.style.display = 'none';
};

// Enhance: immediately persist parameters to the server when saving from the editor
if (saveParamsBtn) {
  const originalHandler = saveParamsBtn.onclick;
  saveParamsBtn.onclick = async () => {
    // run original behaviour (populate hidden field and close)
    try { originalHandler && originalHandler(); } catch (e) { /* ignore */ }
    // If a current definition is selected, call PUT to persist parameters immediately
    if (!currentDefId) {
      // no definition selected — nothing to persist
      return;
    }
    const token = sessionStorage.getItem('token');
    const msgEl = document.getElementById('paramEditorMsg');
    const paramsEl = document.getElementById('defParametersJson');
    let paramsPayload = [];
    if (paramsEl && paramsEl.value && paramsEl.value.trim()) {
      try { paramsPayload = JSON.parse(paramsEl.value); } catch (e) { if (msgEl) msgEl.textContent = 'Invalid parameters JSON: ' + e.message; return; }
    }
    // Build body using existing fields; if blank, fetch current definition to preserve values
    let rn = (document.getElementById('defReportName') && document.getElementById('defReportName').value.trim()) || '';
    let sp = (document.getElementById('defStoredProc') && document.getElementById('defStoredProc').value.trim()) || '';
    let active = (document.getElementById('defActive') && document.getElementById('defActive').checked) || false;
    // If name or stored proc missing, fetch existing def to avoid overwriting with empty strings
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
        // ignore; we'll still attempt save with whatever we have
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
        if (msgEl) { msgEl.textContent = 'Failed to save parameters: ' + t; msgEl.style.color = 'red'; }
        return;
      }
      // Confirm by reloading the single definition and updating UI
      try {
        const rd = await fetch('/report/definitions/' + currentDefId, { headers: (token ? { 'Authorization': 'Bearer ' + token } : {}) });
        if (rd.ok) {
          const jd = await rd.json();
          // update hidden field and visible CSV preview
          const paramsEl2 = document.getElementById('defParametersJson'); if (paramsEl2) paramsEl2.value = JSON.stringify(jd.parameters || []);
          const csvEl = document.getElementById('defParameters'); if (csvEl) csvEl.value = (jd.parameters||[]).map(p => (typeof p === 'string' ? p : (p.name||''))).filter(Boolean).join(',');
          if (msgEl) { msgEl.textContent = 'Parameters saved.'; msgEl.style.color = 'green'; }
        } else {
          if (msgEl) { msgEl.textContent = 'Parameters saved (server did not return updated definition).'; msgEl.style.color = 'green'; }
        }
      } catch (e) {
        if (msgEl) { msgEl.textContent = 'Parameters saved, but failed to refresh: ' + e.message; msgEl.style.color = 'orange'; }
      }
      // Refresh the definitions list so UI reflects latest metadata
      try { loadReportDefinitions(); } catch (e) {}
    } catch (e) {
      if (msgEl) { msgEl.textContent = 'Error saving parameters: ' + e.message; msgEl.style.color = 'red'; }
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
    
    const fd = new FormData();
    for (let f of files) fd.append('files', f);
    const sheetNameVal = document.getElementById('sheetName').value.trim();
    
    // If "Create New Table" is selected, pass special flag
    if (tableName === '__CREATE_NEW__') {
      fd.append('create_new', 'true');
    } else {
      fd.append('table_name', tableName);
    }

    if (sheetNameVal) {
      fd.append('sheet_name', sheetNameVal);
    }
    
    const token = sessionStorage.getItem('token');
    
    try {
      const res = await fetch('/import-data', {
        method: 'POST',
        body: fd,
        headers: token ? {'Authorization': 'Bearer ' + token} : {}
      });
      
      if (res.ok) {
        const j = await res.json();
        
        // Build detailed success message
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
  showPowerBIBtn.onclick = () => { window.location.href = '/powerbi'; };
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
