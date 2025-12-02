(function(){
  const token = sessionStorage.getItem('token');
  if (!token) { window.location.href='/login'; return; }
  
  const iframe = document.getElementById('pbIframe');
  const dropdown = document.getElementById('pbReportDropdown');
  const reportInfo = document.getElementById('pbReportInfo');
  const msgEl = document.getElementById('pbMsg');
  const backBtn = document.getElementById('backBtn');
  const statusEl = document.getElementById('pbStatus');
  const viewport = document.getElementById('pbViewport');
  
  let currentReports = [];
  let currentReportId = null;

  // Go back to dashboard
  if (backBtn) {
    backBtn.onclick = () => {
      window.location.href = '/';
    };
  }

  async function loadReports(){
    try {
      msgEl.innerHTML = '<div class="spinner"></div>';
      const res = await fetch('/powerbi/reports', {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!res.ok) {
        console.error('API Error:', res.status, res.statusText);
        // Try backward compatibility endpoint
        const legacyRes = await fetch('/powerbi/settings', {
          headers: { 'Authorization': 'Bearer ' + token }
        });
        if (legacyRes.ok) {
          const data = await legacyRes.json();
          if (data.embed_url && data.embed_url.trim()) {
            currentReports = [{
              id: 1,
              name: data.title || data.name || 'Power BI Report',
              embed_url: data.embed_url,
              show_filter_pane: data.show_filter_pane !== false,
              show_nav_pane: data.show_nav_pane !== false,
              allow_fullscreen: data.allow_fullscreen !== false
            }];
            msgEl.innerText = '';
            return currentReports;
          }
        }
        msgEl.innerText = 'Error loading reports';
        return [];
      }
      
      const data = await res.json();
      currentReports = data.reports || [];
      msgEl.innerText = '';
      return currentReports;
    } catch (e) {
      console.error('Error loading reports:', e);
      msgEl.innerText = 'Connection error';
      return [];
    }
  }

  async function loadHealth(url){
    try {
      const res = await fetch('/powerbi/health?url=' + encodeURIComponent(url), {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch { return null; }
  }

  async function populateDropdown(){
    dropdown.innerHTML = '';
    
    if (currentReports.length === 0) {
      dropdown.innerHTML = '<option value="">No reports available</option>';
      dropdown.disabled = true;
      reportInfo.innerText = 'No reports available';
      statusEl.innerText = 'Not configured';
      return;
    }
    
    currentReports.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.innerText = r.name || 'Unnamed Report';
      dropdown.appendChild(opt);
    });
    
    // Try to restore selected report from sessionStorage
    const savedId = sessionStorage.getItem('selectedPowerBIReport');
    if (savedId && currentReports.find(r => r.id == savedId)) {
      dropdown.value = savedId;
    } else {
      dropdown.value = currentReports[0].id;
    }
    
    dropdown.onchange = () => {
      const reportId = dropdown.value;
      if (reportId) {
        sessionStorage.setItem('selectedPowerBIReport', reportId);
        loadAndEmbedReport(reportId);
      }
    };
    
    // Load first report automatically
    if (dropdown.value) {
      loadAndEmbedReport(dropdown.value);
    }
  }

  async function loadAndEmbedReport(reportId){
    const report = currentReports.find(r => r.id == reportId);
    if (!report) {
      reportInfo.innerText = 'Report not found';
      statusEl.innerText = 'Error';
      return;
    }
    
    currentReportId = reportId;
    reportInfo.innerText = report.name || 'Unnamed Report';
    statusEl.innerText = 'Loading...';
    
    try {
      const health = await loadHealth(report.embed_url);
      let embedUrl = (health && health.normalized_url) ? health.normalized_url : report.embed_url;
      
      // Add display option parameters if needed
      const params = [];
      if (report.show_filter_pane !== undefined) {
        params.push('filterPaneEnabled=' + report.show_filter_pane);
      }
      if (report.show_nav_pane !== undefined) {
        params.push('navContentPaneEnabled=' + report.show_nav_pane);
      }
      
      if (params.length > 0) {
        const sep = embedUrl.includes('?') ? '&' : '?';
        embedUrl += sep + params.join('&');
      }
      
      iframe.src = embedUrl;
      if (report.allow_fullscreen) {
        iframe.setAttribute('allowfullscreen','true');
      } else {
        iframe.removeAttribute('allowfullscreen');
      }
      
      statusEl.innerText = 'Ready';
    } catch (e) {
      console.error('Error loading report:', e);
      statusEl.innerText = 'Error loading report';
    }
  }

  async function showEmptyState(){
    dropdown.innerHTML = '<option value="">No reports configured</option>';
    dropdown.disabled = true;
    reportInfo.innerText = 'No Power BI reports configured';
    statusEl.innerText = 'Not configured';
    
    const emptyHtml = `
      <div style="display:flex;align-items:center;justify-content:center;height:100%;color:#ff9800;font-family:Segoe UI, sans-serif;text-align:center;padding:40px;">
        <div>
          <div style="font-size:48px;margin-bottom:20px;">📊</div>
          <div style="font-size:18px;font-weight:600;margin-bottom:10px;">No Power BI Reports</div>
          <div style="font-size:14px;color:#999;margin-bottom:20px;">No reports have been configured yet.</div>
          <div style="font-size:13px;color:#bbb;">Ask an administrator to:</div>
          <div style="font-size:13px;color:#999;margin-top:10px;">1. Click ⚙️ Power BI Settings in Admin panel</div>
          <div style="font-size:13px;color:#999;">2. Add a Power BI report</div>
          <div style="font-size:13px;color:#999;">3. Return here to view it</div>
        </div>
      </div>
    `;
    
    if (viewport && iframe) {
      viewport.innerHTML = emptyHtml;
    }
  }

  async function init(){
    const reports = await loadReports();
    
    if (reports.length === 0) {
      await showEmptyState();
      return;
    }
    
    await populateDropdown();
  }

  // Run initialization
  init().catch(e => {
    console.error('Init error:', e);
    msgEl.innerText = 'Error initializing';
  });
})();
