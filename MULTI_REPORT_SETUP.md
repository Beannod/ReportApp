# Multi-Report Power BI Implementation

## Overview
The ReportApp now supports managing and displaying multiple Power BI reports. Users can switch between different reports using a dropdown selector, and administrators can add/delete reports through a dedicated management panel.

## Architecture

### Backend (FastAPI - app/api.py)

#### New Endpoints

**1. GET /powerbi/reports**
- Returns list of all enabled Power BI reports
- Response:
  ```json
  {
    "reports": [
      {
        "id": 1,
        "name": "Sales Dashboard",
        "embed_url": "https://...",
        "enabled": true,
        "show_filter_pane": true,
        "show_nav_pane": true,
        "allow_fullscreen": true,
        "sort_order": 1
      }
    ]
  }
  ```

**2. GET /powerbi/settings** (Backward Compatibility)
- Returns the first enabled report from the database
- Maintains compatibility with existing code
- Response: Single report object (same structure as above)

**3. POST /powerbi/reports**
- Add a new Power BI report
- Request body:
  ```json
  {
    "title": "Report Name",
    "embed_url": "https://...",
    "enabled": true,
    "show_filter_pane": true,
    "show_nav_pane": true,
    "allow_fullscreen": true
  }
  ```
- Auto-increments sort_order
- Normalizes URL by appending `rs:embed=true` if missing
- Returns: `{success: true, id: <report_id>, message: "..."}`

**4. DELETE /powerbi/reports/{report_id}**
- Delete a Power BI report by ID
- Admin only
- Returns: `{success: true, message: "Report deleted successfully"}`

**5. GET /powerbi/health**
- Probes Power BI URL to verify embed link is accessible
- Classifies URL type (portal/legacy/cloud/unknown)
- Returns health status and classification

### Database Schema

**Table: powerbi_reports**
```sql
CREATE TABLE powerbi_reports (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    embed_url NVARCHAR(MAX) NOT NULL,
    enabled BIT DEFAULT 1,
    show_filter_pane BIT DEFAULT 1,
    show_nav_pane BIT DEFAULT 1,
    allow_fullscreen BIT DEFAULT 1,
    sort_order INT DEFAULT 0,
    created_at DATETIME DEFAULT GETDATE(),
    updated_at DATETIME DEFAULT GETDATE(),
    updated_by NVARCHAR(100)
)
```

### Frontend

#### 1. Admin Panel (index.html + app.js)
- **Button**: "Power BI Settings" in admin section
- **Modal**: Multi-report management interface
  - **Add Section**: Form to add new reports
    - Report Name input
    - Embed URL input
    - Display options (checkboxes for filter pane, nav pane, fullscreen)
  - **List Section**: Shows all existing reports
    - Displays report details
    - Delete button for each report
    - Real-time list refresh after add/delete

#### 2. Report Viewer Page (powerbi.html + powerbi.js)
- **URL**: `/powerbi` (standalone fullscreen page)
- **Header**: 
  - Title with emoji
  - Report selector dropdown
  - Back button to dashboard
- **Report Selector**:
  - Populated from GET /powerbi/reports endpoint
  - Loads first report by default
  - Persists selected report ID in sessionStorage
  - onChange: Reloads iframe with new report embed URL
- **Viewport**: Fullscreen iframe for selected report
- **Footer**: 
  - Current report name
  - Status indicator

## User Workflows

### For Administrators

1. **Add a New Report**:
   - Click "Power BI Settings" button in admin panel
   - Fill in report name and embed URL
   - Configure display options (filter pane, nav pane, fullscreen)
   - Click "Add Report"
   - Report appears in the list below the form
   - Users can immediately see the new report in the dropdown

2. **Delete a Report**:
   - Click "Power BI Settings" button
   - Click "Delete" button next to the report to remove
   - Confirm deletion
   - Report is removed from list
   - Users no longer see it in dropdown

### For Regular Users

1. **View Power BI Reports**:
   - Click "Power BI Dashboard" button in Quick Actions
   - Redirects to `/powerbi` page
   - Report dropdown pre-populated with available reports
   - First report loads by default
   - Select different reports from dropdown to switch views
   - Selected report persists during session

## Technical Details

### URL Normalization
- Automatically appends `rs:embed=true` parameter if missing
- Supports Power BI Report Server (portal and legacy endpoints)
- Supports cloud Power BI with proper authentication

### Display Options
- **Show Filter Pane**: Allows users to interact with report filters
- **Show Navigation Pane**: Shows document map/navigation
- **Allow Fullscreen**: Enables fullscreen mode for reports

### Session Persistence
- Selected report ID stored in sessionStorage
- Survives page refreshes within same browser session
- Resets on new session or browser close

## Examples

### Adding a Report URL

**Power BI Cloud (Publish to Web)**:
```
https://app.powerbi.com/view?r=eyJrIjoiZjI4NTg4ZjgtNDZmYi00OTk5LWI0ZjEtOTU1ZDRlNTU1ZjNiIiwidCI6IjA5YWI4MzVhLTg1YjItNGNjOC05ZTFmLTk2ZGI5YWFlMTI3MCIsImMiOjR9
```

**Power BI Report Server (Portal URL)**:
```
http://DESKTOP-LB9B6I4/Reports/powerbi/Sales%20Dashboard
```

**Power BI Report Server (Legacy URL)**:
```
http://DESKTOP-LB9B6I4/ReportServer/Pages/ReportViewer.aspx?/Reports/Mangsir%20power%20bi
```

All formats are automatically normalized with `rs:embed=true` appended when needed.

## Security

- **Authentication**: All endpoints require valid JWT token
- **Admin Only**: POST/DELETE endpoints require admin role
- **User Read Access**: GET endpoints accessible to authenticated users
- **Validation**: URLs checked for accessibility via health endpoint

## Testing

### Test Adding a Report
```bash
curl -X POST http://localhost:8000/powerbi/reports \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Report",
    "embed_url": "https://...",
    "enabled": true,
    "show_filter_pane": true,
    "show_nav_pane": true,
    "allow_fullscreen": true
  }'
```

### Test Getting All Reports
```bash
curl http://localhost:8000/powerbi/reports \
  -H "Authorization: Bearer <token>"
```

### Test Deleting a Report
```bash
curl -X DELETE http://localhost:8000/powerbi/reports/1 \
  -H "Authorization: Bearer <token>"
```

## Backward Compatibility

- `GET /powerbi/settings` still works, returns first enabled report
- `POST /powerbi/settings` routes to `POST /powerbi/reports` internally
- Existing single-report configurations can be migrated by:
  1. Noting the old embed URL and settings
  2. Adding as new report via POST endpoint
  3. Future requests return all reports from new table

## Future Enhancements

- Edit existing reports (PUT endpoint)
- Reorder reports via drag-and-drop
- Filter reports by tags/categories
- Report usage analytics
- Automatic report refresh scheduling
- Scheduled Power BI data refreshes
