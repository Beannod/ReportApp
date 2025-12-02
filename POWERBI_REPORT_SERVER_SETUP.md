# Power BI Report Server - Complete Setup Guide

## 📥 Step 1: Download Power BI Report Server

### Download Links:
1. **Power BI Report Server**: https://www.microsoft.com/en-us/download/details.aspx?id=57270
2. **Power BI Desktop (Report Server version)**: https://www.microsoft.com/en-us/download/details.aspx?id=57271

⚠️ **Important:** You need the special "Report Server" version of Power BI Desktop, NOT the regular Power BI Desktop!

---

## 💻 Step 2: Prerequisites

Before installing, make sure you have:
- ✅ **Windows Server 2012 or later** (or Windows 10/11 Pro for testing)
- ✅ **SQL Server 2012 or later** (You already have SQL Server Express: `DESKTOP-LB9B6I4\SQLEXPRESS`)
- ✅ **Administrator privileges** on the computer
- ✅ **.NET Framework 4.7.2 or later**

---

## 🔧 Step 3: Install Power BI Report Server

### Installation Steps:

1. **Run the Installer**
   - Double-click `PowerBIReportServer.exe`
   - Click "Next" on welcome screen

2. **License Agreement**
   - Read and accept the terms
   - Click "Next"

3. **Choose Edition**
   - Select **"Evaluation"** (free for 180 days, renewable)
   - OR select **"Developer"** (free, for non-production use)
   - Click "Next"

4. **Installation Folder**
   - Default: `C:\Program Files\Microsoft Power BI Report Server`
   - Click "Next"

5. **Configure Report Server**
   - Select **"Install and configure"**
   - Click "Next"

6. **Database Engine**
   - Server name: **`DESKTOP-LB9B6I4\SQLEXPRESS`** (your SQL Server)
   - Authentication: **Windows Authentication**
   - Click "Test Connection" to verify
   - Click "Next"

7. **Report Server Database**
   - Database name: **`ReportServer`** (default)
   - Click "Next"

8. **Web Portal URL**
   - Virtual directory: **`Reports`** (default)
   - NOTE: Your instance is currently bound to port **8083** (detected via `netsh http show urlacl`).
   - Final URL will be: `http://localhost:8083/Reports` or `http://DESKTOP-LB9B6I4:8083/Reports`
   - Click "Next"

9. **Ready to Install**
   - Review settings
   - Click "Install"

10. **Installation Complete**
    - Click "Finish"

---

## 🎨 Step 4: Install Power BI Desktop (Report Server Edition)

1. **Download the Report Server version**
   - Link: https://www.microsoft.com/en-us/download/details.aspx?id=57271
   - This is different from regular Power BI Desktop!

2. **Run the Installer**
   - Double-click `PBIDesktopRS.exe`
   - Follow installation wizard
   - Accept defaults

3. **Verify Installation**
   - Open Power BI Desktop (Report Server version)
   - Top title bar should say "Power BI Desktop (Report Server)"

---

## 📊 Step 5: Publish Your Report

### Using Power BI Desktop (Report Server Edition):

1. **Open Your Report**
   ```powershell
   # If you have the regular Power BI Desktop version open, close it first
   Start-Process "C:\Program Files\Microsoft Power BI Desktop RS\bin\PBIDesktop.exe"
   ```
   - Then open: `D:\Software\ReportApp\Mangsir power bi.pbix`

2. **Configure Data Source (if needed)**
   - Click "Transform data"
   - Update any SQL Server connections to point to `DESKTOP-LB9B6I4\SQLEXPRESS`
   - Close & Apply

3. **Publish to Report Server**
   - Click **"File" → "Save As" → "Power BI Report Server"**
   - If the ribbon "Publish" button doesn’t appear, "Save As" is sufficient for Report Server deployments.

4. **Enter Server Details (ROOT URL ONLY)**
   - In the dialog, you must supply ONLY the root server address, NOT a report item path and NOT any query parameters.
   - Valid examples:
     - Portal root: `http://DESKTOP-LB9B6I4/reports` (or with port if non‑default, e.g. `http://DESKTOP-LB9B6I4:8083/reports`)
     - Service root (legacy): `http://DESKTOP-LB9B6I4/ReportServer` (or `http://DESKTOP-LB9B6I4:8083/ReportServer`)
   - Do NOT enter: `...?rs:embed=true`, do NOT include the report name in this field. Supplying an item path like `ReportServer?/Mangsir%20power%20bi&rs:embed=true` causes the "Unexpected error encountered" message.
   - After the root is accepted you will browse folders in the UI.
   - Click "OK"

5. **Choose Folder**
   - Select destination folder (create new folder if needed)
   - Name: `Mangsir` (or keep original name)
   - Click "Save"

6. **Success!**
   - You'll see: "Your report has been published"
   - Click "Open [report name] in Power BI Report Server"

---

## 🌐 Step 6: Get the Embed URL

### Method 1: From Web Portal

1. **Open Report Server Web Portal**
   - URL: `http://localhost:8083/reports`
   - Login with Windows credentials (automatic if on same machine). If prompted for auth, your Windows account needs portal access.

2. **Navigate to Your Report**
   - Find "Mangsir power bi" report
   - Click on it to open

3. **Get Embed URL**
    - Click the **"⋯" (More)** menu (if using the Web Portal interface)
    - Or right-click the report → "Embed"
    - Copy the URL that looks like (portal style):
       ```
       http://DESKTOP-LB9B6I4/reports/report/Mangsir%20power%20bi?rs:embed=true
       ```
    - If you only have the legacy service endpoint (`/ReportServer`) and no `/reports` portal, use the legacy pattern shown below.

### Method 2: Manual URL Construction

Portal Format (preferred):
```
http://[server][:port]/reports/report/[FolderPath/][ReportName]?rs:embed=true
```

Legacy Service Format (if only `http://SERVER:PORT/ReportServer` works):
```
http://[server][:port]/ReportServer?/[FolderPath/][ReportName]&rs:embed=true
```
Note the **`?`** before the item path and **`&rs:embed=true`** instead of `?rs:embed=true` when using the legacy endpoint.

Examples:
```
# Portal style (port 80)
http://DESKTOP-LB9B6I4/reports/report/Mangsir%20power%20bi?rs:embed=true

# Portal style (custom port 8083)
http://DESKTOP-LB9B6I4:8083/reports/report/Mangsir%20power%20bi?rs:embed=true

# Legacy service style (port 80)
http://DESKTOP-LB9B6I4/ReportServer?/Mangsir%20power%20bi&rs:embed=true

# Legacy service style (custom port 8083)
http://DESKTOP-LB9B6I4:8083/ReportServer?/Mangsir%20power%20bi&rs:embed=true
```

**Add filter pane (portal style):**
```
http://DESKTOP-LB9B6I4/reports/report/Mangsir%20power%20bi?rs:embed=true&rc:toolbar=true
```
**Add filter pane (legacy service style):**
```
http://DESKTOP-LB9B6I4/ReportServer?/Mangsir%20power%20bi&rs:embed=true&rc:toolbar=true
```

---

## ⚙️ Step 7: Configure in Your ReportApp

1. **Start Your App**
   ```powershell
   cd D:\Software\ReportApp
   .venv\Scripts\Activate.ps1
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload
   ```

2. **Open Browser**
   - Go to: `http://127.0.0.1:8001`
   - Login as admin

3. **Configure Power BI Settings**
   - Click **"⚙️ Power BI Settings"** (admin button)
   - Enter:
     - **Embed URL**: `http://localhost/reports/report/Mangsir%20power%20bi?rs:embed=true`
     - **Title**: `Mangsir Dashboard`
     - ✅ Enable Power BI Dashboard
     - ✅ Show Filter Pane
     - ✅ Show Navigation Pane
     - ✅ Allow Fullscreen Mode
   - Click **"Save Settings"**

4. **View Dashboard**
   - Click **"📈 Power BI Dashboard"** button
   - Switch to **"🌐 Web Dashboard"** tab
   - Your report should load with full interactivity!

---

## 🔒 Step 8: Configure Access (Optional)

### Allow Network Access (for other computers):

1. **Open Report Server Configuration Manager**
   - Start → "Report Server Configuration Manager"
   - Connect to your instance

2. **Web Portal URL**
   - Click "Web Portal URL"
   - Add URL reservation for your IP or hostname
   - Click "Apply"

3. **Firewall Rules**
   ```powershell
   # Allow HTTP traffic on port 80
   New-NetFirewallRule -DisplayName "Power BI Report Server" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
   ```

4. **Update App Configuration**
   - Change embed URL from `localhost` to your machine name:
     ```
     http://DESKTOP-LB9B6I4/reports/report/Mangsir%20power%20bi?rs:embed=true
     ```

---

## ✅ Verification Checklist

- [ ] Power BI Report Server installed successfully
- [ ] Can access web portal at `http://localhost/reports`
- [ ] Power BI Desktop (Report Server version) installed
- [ ] Report published to Report Server
- [ ] Embed URL obtained
- [ ] ReportApp configured with embed URL
- [ ] Dashboard displays in browser with filters

---

## 🐛 Troubleshooting

### Issue: "Cannot connect to Report Server"
**Solution:**
```powershell
# Check if Report Server service is running
Get-Service | Where-Object {$_.Name -like "*ReportServer*"}

# Start the service if stopped
Start-Service SQLServerReportingServices
```

### Issue: "Report Server database not found"
**Solution:**
- Open SQL Server Management Studio
- Connect to `DESKTOP-LB9B6I4\SQLEXPRESS`
- Verify `ReportServer` database exists
- If not, re-run Report Server Configuration Manager → Database setup

### Issue: "Access Denied"
**Solution:**
- Ensure Windows user has permissions
- Open Report Server web portal
- Settings → Security → Add your user with "Content Manager" role

### Issue: "Can't publish from Power BI Desktop"
**Solution:**
- Make sure you're using **Power BI Desktop (Report Server)** edition, NOT regular Power BI Desktop
- Check server URL is correct
- Verify you can access `http://localhost/reports` in browser

### Issue: "Report doesn't load in ReportApp"
**Solution:**
- Check browser console for errors (F12)
- Verify embed URL is correct
- Try accessing the URL directly in browser first
- Make sure `?rs:embed=true` is included in URL

---

## 📚 Quick Reference

### URLs:
- **Web Portal**: `http://localhost:8083/reports`
- **Embed Format**: `http://localhost:8083/reports/report/[ReportName]?rs:embed=true`
   - Legacy Alternative: `http://localhost:8083/ReportServer?/[ReportName]&rs:embed=true`

### Services:
- **Service Name**: `SQLServerReportingServices` or `PowerBIReportServer`
- **Active Port (Detected)**: 8083 (HTTP)
   - If you later reconfigure to port 80, the URLs will drop the `:8083` portion.

### Paths:
- **Installation**: `C:\Program Files\Microsoft Power BI Report Server`
- **Database**: `ReportServer` on `DESKTOP-LB9B6I4\SQLEXPRESS`

---

## 🎉 Next Steps

After setup is complete:
1. ✅ Your Power BI dashboard is accessible via web browser
2. ✅ Full interactivity with filters and slicers (ensure `rs:embed=true`; use `?` for portal pattern, `?` then `&` for legacy pattern)
3. ✅ No cloud, no Microsoft account, no email needed
4. ✅ On-premises only - your data stays local
5. ✅ Free to use (Evaluation or Developer edition)

**All users can now view the dashboard directly in their browser with full filter capabilities!**
