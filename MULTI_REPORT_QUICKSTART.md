# Multi-Report Power BI - Quick Start Guide

## 🚀 Getting Started

### Step 1: Start the Application
```bash
cd d:\Software\ReportApp
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 2: Log In
- Navigate to http://localhost:8000
- Login with admin credentials
- You'll see the dashboard with admin controls

### Step 3: Add Your First Report

1. Click **⚙️ Power BI Settings** in the Admin Controls section
2. In the "Add New Report" form:
   - **Report Name**: Give your report a descriptive name
   - **Embed URL**: Paste your Power BI embed URL (see examples below)
   - **Display Options**: Check/uncheck as needed
   - Click **Add Report**
3. Your report appears in the "Existing Reports" list below

### Step 4: View Reports

1. Click **📈 Power BI Dashboard** in Quick Actions
2. You'll see the fullscreen Power BI viewer page
3. Use the dropdown at the top to switch between reports
4. The page remembers your selection during your session

---

## 📋 Report URL Examples

### Option 1: Cloud Power BI (Publish to Web)
**Pros**: Easy to share, no on-prem infrastructure
**Cons**: Less secure, limited control

Steps:
1. Open your report in Power BI Service (app.powerbi.com)
2. Click **Share** → **Embed report** → **Publish to web**
3. Copy the embed link (looks like: `https://app.powerbi.com/view?r=...`)

### Option 2: Power BI Report Server (On-Premises)
**Pros**: Secure, internal only, free
**Cons**: Requires server setup

Your server: `http://DESKTOP-LB9B6I4` or `http://DESKTOP-LB9B6I4/Reports`

**Portal URL** (recommended):
```
http://DESKTOP-LB9B6I4/Reports/powerbi/Report%20Name
```

**Legacy URL**:
```
http://DESKTOP-LB9B6I4/ReportServer/Pages/ReportViewer.aspx?/Reports/Report%20Name
```

---

## 🎛️ Display Options Explained

| Option | Purpose |
|--------|---------|
| **Show Filter Pane** | Users can interact with report filters (slicers) |
| **Show Navigation Pane** | Shows report navigation/document map sidebar |
| **Allow Fullscreen** | Users can enter fullscreen mode |

---

## 👨‍💼 Admin Tasks

### Add Multiple Reports
- Repeat Step 3 for each report
- Each gets a unique dropdown entry
- Users can switch between them instantly

### Delete a Report
1. Click **⚙️ Power BI Settings**
2. Find the report in "Existing Reports" section
3. Click **Delete** button
4. Confirm deletion
5. Report is immediately removed from all user dropdowns

### View All Reports
1. Click **⚙️ Power BI Settings**
2. All configured reports shown with their URLs and settings
3. List updates in real-time as reports are added/deleted

---

## 👤 User Experience

### Viewing Reports
1. Click **📈 Power BI Dashboard** from main page
2. Dropdown shows all available reports
3. First report loads automatically
4. Select any report from dropdown to switch
5. Report selection saved for current session
6. Click **← Back to Dashboard** to return to main page

### What They Can Do
- Switch between reports instantly
- Use filters/slicers (if enabled by admin)
- See report navigation (if enabled)
- Go fullscreen (if enabled)
- All options controlled by admin settings

---

## 🔍 Troubleshooting

### Report Not Loading
1. Verify embed URL is correct
2. Check if Power BI server/cloud is accessible
3. Ensure authentication/permissions are set up
4. Try pasting URL directly in browser to verify

### Can't See Reports in Dropdown
1. Admin may not have added any yet - ask them
2. Log out and log back in to refresh
3. Check browser console (F12) for errors
4. Verify you have network access to Power BI server

### URL Gets Modified
- App automatically adds `rs:embed=true` parameter
- This is normal and required for embedding
- Don't manually edit the URL after adding

### Session Lost
- Selected report resets on new browser session
- Start fresh and select desired report from dropdown
- Consider asking admin to set preferred report

---

## 🔐 Security Notes

- Reports require valid login to view
- Admin-only features are protected
- URLs are normalized but not modified
- Each action logged with admin username
- Power BI permissions still apply (e.g., row-level security)

---

## 📊 Example Setup

Here's a typical multi-report setup:

| Report | URL | Purpose | Filters | Nav | Fullscreen |
|--------|-----|---------|---------|-----|-----------|
| Sales Dashboard | `http://server/Reports/powerbi/Sales` | Daily sales tracking | ✓ | ✓ | ✓ |
| Inventory Report | `http://server/Reports/powerbi/Inventory` | Stock management | ✓ | ✓ | ✓ |
| Financial Summary | `https://app.powerbi.com/view?r=...` | Monthly reports | ✓ | ✗ | ✗ |

Users can switch between all three instantly from the dropdown!

---

## ✨ Tips & Tricks

1. **Name Reports Clearly**: Use descriptive names like "Q4 Sales Dashboard" not "Report 1"
2. **Test URLs First**: Open in browser first to ensure they work
3. **Consistent Settings**: Use same display options unless needed otherwise
4. **Regular Backups**: Database automatically stores all reports
5. **Remove Unused**: Delete old/test reports to keep list clean

---

## ❓ FAQ

**Q: Can I reorder reports?**
A: Currently shows in order added. Consider naming with numbers (1. Sales, 2. Inventory) for manual ordering.

**Q: Can regular users edit reports?**
A: No, only admins can add/delete. Users can only view and select.

**Q: What happens if Power BI server goes down?**
A: Report won't load, but admin settings preserved. Works again when server is back.

**Q: Can I move reports between servers?**
A: Yes, edit the URL in database or delete and re-add with new URL.

**Q: Are there limits on number of reports?**
A: No hard limit, but recommend 5-20 for best UX.

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review Power BI server logs
3. Verify network connectivity
4. Check application logs in terminal
5. Contact your admin for configuration help
