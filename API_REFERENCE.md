# Power BI Multi-Report API Reference

## Authentication

All endpoints require a valid JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

Tokens are obtained via `/login` endpoint and stored in sessionStorage on frontend.

---

## Endpoints

### 1. GET /powerbi/reports
**Get all Power BI reports**

**Authentication**: Required (any authenticated user)

**Response (200 OK)**:
```json
{
  "reports": [
    {
      "id": 1,
      "name": "Sales Dashboard",
      "embed_url": "http://server/Reports/powerbi/Sales?rs:embed=true",
      "enabled": true,
      "show_filter_pane": true,
      "show_nav_pane": true,
      "allow_fullscreen": true,
      "sort_order": 1,
      "created_at": "2024-01-15T10:30:00",
      "updated_at": "2024-01-15T10:30:00",
      "updated_by": "admin"
    },
    {
      "id": 2,
      "name": "Inventory Report",
      "embed_url": "http://server/Reports/powerbi/Inventory?rs:embed=true",
      "enabled": true,
      "show_filter_pane": false,
      "show_nav_pane": true,
      "allow_fullscreen": true,
      "sort_order": 2,
      "created_at": "2024-01-16T09:15:00",
      "updated_at": "2024-01-16T09:15:00",
      "updated_by": "admin"
    }
  ]
}
```

**Error (401 Unauthorized)**:
```json
{
  "detail": "Unauthorized"
}
```

**Example cURL**:
```bash
curl -X GET http://localhost:8000/powerbi/reports \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

### 2. GET /powerbi/settings
**Get first enabled Power BI report (backward compatibility)**

**Authentication**: Required (any authenticated user)

**Response (200 OK)**:
```json
{
  "id": 1,
  "name": "Sales Dashboard",
  "embed_url": "http://server/Reports/powerbi/Sales?rs:embed=true",
  "enabled": true,
  "show_filter_pane": true,
  "show_nav_pane": true,
  "allow_fullscreen": true,
  "title": "Sales Dashboard",
  "sort_order": 1
}
```

**Response (200 OK) - If no reports configured**:
```json
{
  "enabled": false,
  "embed_url": "",
  "title": "Power BI Dashboard"
}
```

**Example cURL**:
```bash
curl -X GET http://localhost:8000/powerbi/settings \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

### 3. POST /powerbi/reports
**Add a new Power BI report**

**Authentication**: Required + Admin role only

**Request Body**:
```json
{
  "title": "Q1 Sales Report",
  "embed_url": "https://app.powerbi.com/view?r=eyJrIjoiZjI4NTg4ZjgtNDZmYi00OTk5LWI0ZjEtOTU1ZDRlNTU1ZjNiIiwidCI6IjA5YWI4MzVhLTg1YjItNGNjOC05ZTFmLTk2ZGI5YWFlMTI3MCIsImMiOjR9",
  "enabled": true,
  "show_filter_pane": true,
  "show_nav_pane": true,
  "allow_fullscreen": true
}
```

**Request Parameters**:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| title | string | Yes | - | Report name/title (max 255 chars) |
| embed_url | string | Yes | - | Power BI embed URL |
| enabled | boolean | No | true | Whether report is visible to users |
| show_filter_pane | boolean | No | true | Show report filter pane |
| show_nav_pane | boolean | No | true | Show navigation pane |
| allow_fullscreen | boolean | No | true | Allow fullscreen mode |

**Response (200 OK)**:
```json
{
  "success": true,
  "id": 3,
  "message": "Power BI report 'Q1 Sales Report' added successfully",
  "normalized_embed_url": "https://app.powerbi.com/view?r=eyJrIjoiZjI4NTg4ZjgtNDZmYi00OTk5LWI0ZjEtOTU1ZDRlNTU1ZjNiIiwidCI6IjA5YWI4MzVhLTg1YjItNGNjOC05ZTFmLTk2ZGI5YWFlMTI3MCIsImMiOjR9&rs:embed=true"
}
```

**Error (400 Bad Request)**:
```json
{
  "detail": "Title is required"
}
```

**Error (403 Forbidden)**:
```json
{
  "detail": "Admin access required"
}
```

**Error (503 Service Unavailable)**:
```json
{
  "detail": "SQL Server not available"
}
```

**Example cURL**:
```bash
curl -X POST http://localhost:8000/powerbi/reports \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Q1 Sales Report",
    "embed_url": "https://app.powerbi.com/view?r=...",
    "enabled": true,
    "show_filter_pane": true,
    "show_nav_pane": true,
    "allow_fullscreen": true
  }'
```

---

### 4. DELETE /powerbi/reports/{report_id}
**Delete a Power BI report by ID**

**Authentication**: Required + Admin role only

**Path Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| report_id | integer | Yes | ID of report to delete |

**Response (200 OK)**:
```json
{
  "success": true,
  "message": "Power BI report 3 deleted successfully"
}
```

**Error (404 Not Found)**:
```json
{
  "detail": "Power BI report with ID 999 not found"
}
```

**Error (403 Forbidden)**:
```json
{
  "detail": "Admin access required"
}
```

**Error (503 Service Unavailable)**:
```json
{
  "detail": "SQL Server not available"
}
```

**Example cURL**:
```bash
curl -X DELETE http://localhost:8000/powerbi/reports/3 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

### 5. GET /powerbi/health
**Check Power BI URL health and get classification**

**Authentication**: Required (any authenticated user)

**Query Parameters**:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| url | string | No | Specific URL to check (if not provided, checks stored URL) |

**Response (200 OK)**:
```json
{
  "input_url": "http://DESKTOP-LB9B6I4/Reports/powerbi/Sales Dashboard",
  "normalized_url": "http://DESKTOP-LB9B6I4/Reports/powerbi/Sales Dashboard?rs:embed=true",
  "classification": "portal",
  "status_code": 200,
  "ok": true,
  "needs_embed_param": true,
  "error": null
}
```

**Response Fields**:

| Field | Type | Description |
|-------|------|-------------|
| input_url | string | Original URL provided or stored |
| normalized_url | string | URL after normalization |
| classification | string | URL type: portal, legacy, cloud, unknown, none, error |
| status_code | integer | HTTP status code from probe (if attempted) |
| ok | boolean | Whether URL is accessible (200 or 401 considered OK) |
| needs_embed_param | boolean | Whether rs:embed=true was added |
| error | string | Error message if probe failed |

**Classification Types**:

| Type | Description | Example URL |
|------|-------------|-------------|
| portal | Power BI Report Server portal | http://server/Reports/powerbi/Report |
| legacy | Power BI Report Server legacy | http://server/ReportServer/Pages/ReportViewer |
| cloud | Power BI Cloud | https://app.powerbi.com/view?r=... |
| unknown | Other URL format | Unknown format |
| none | No URL configured | - |
| error | Error during classification | - |

**Example cURL**:
```bash
# Check with specific URL
curl -X GET "http://localhost:8000/powerbi/health?url=http%3A%2F%2Fserver%2FReports%2Fpowerbi%2FSales" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# Check stored URL
curl -X GET http://localhost:8000/powerbi/health \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

---

## Response Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 400 | Bad Request | Invalid parameters or missing required fields |
| 401 | Unauthorized | Missing or invalid authentication token |
| 403 | Forbidden | Authenticated but insufficient permissions (e.g., not admin) |
| 404 | Not Found | Resource not found (e.g., report ID doesn't exist) |
| 500 | Internal Server Error | Server-side error |
| 503 | Service Unavailable | Database or external service not available |

---

## Database Schema

### powerbi_reports Table

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

**Column Descriptions**:

| Column | Type | Purpose |
|--------|------|---------|
| id | INT | Unique report identifier (auto-increment) |
| name | NVARCHAR(255) | Report display name |
| embed_url | NVARCHAR(MAX) | Power BI embed URL |
| enabled | BIT | Whether report is visible (1=yes, 0=no) |
| show_filter_pane | BIT | Show filter/slicer pane |
| show_nav_pane | BIT | Show navigation pane |
| allow_fullscreen | BIT | Allow fullscreen mode |
| sort_order | INT | Display order (auto-incremented) |
| created_at | DATETIME | When report was added |
| updated_at | DATETIME | When report was last modified |
| updated_by | NVARCHAR(100) | Username of last modifier |

---

## URL Normalization Rules

The system automatically normalizes Power BI URLs:

1. **Portal URLs**: `http://server/Reports/powerbi/Name` → `http://server/Reports/powerbi/Name?rs:embed=true`
2. **Legacy URLs**: `http://server/ReportServer/Pages/...` → `http://server/ReportServer/Pages/...?rs:embed=true`
3. **Cloud URLs**: Already formatted, embedded directly
4. **Parameter Handling**: If `rs:embed=true` already present, not added again

---

## Rate Limiting

No rate limiting currently implemented. Consider adding for production use.

---

## Pagination

Not currently implemented. All reports returned in single response.

For large numbers of reports (100+), consider implementing pagination with:
- `?page=1&limit=20` query parameters
- Response includes `total`, `page`, `limit` fields

---

## Filtering & Sorting

Currently not supported via API. To filter/sort:
1. Retrieve all reports via GET /powerbi/reports
2. Filter/sort client-side

Future enhancement: Add query parameters like:
- `?enabled=true` - Filter by enabled status
- `?sort_by=name` - Sort by field
- `?sort_dir=asc` - Sort direction

---

## Bulk Operations

Not currently supported. Perform bulk add/delete with multiple individual API calls.

---

## Caching

Frontend caches report list in sessionStorage:
- Key: `selectedPowerBIReport`
- Persists selected report ID during session
- Cleared on browser close

Backend has no caching layer. Consider Redis for frequently accessed URLs.

---

## Error Handling Examples

### Invalid JSON in POST
```json
{
  "detail": "Invalid JSON"
}
```

### Missing Required Field
```json
{
  "detail": "embed_url is required"
}
```

### Database Connection Failed
```json
{
  "detail": "SQL Server not available"
}
```

### Unauthorized Access to Admin Function
```json
{
  "detail": "Not authorized to perform this action"
}
```

---

## Integration Examples

### Python
```python
import requests

token = "eyJhbGciOiJIUzI1NiIs..."
headers = {"Authorization": f"Bearer {token}"}

# Get all reports
response = requests.get(
    "http://localhost:8000/powerbi/reports",
    headers=headers
)
reports = response.json()["reports"]

# Add new report
new_report = {
    "title": "New Dashboard",
    "embed_url": "https://app.powerbi.com/view?r=...",
    "enabled": True,
    "show_filter_pane": True
}
response = requests.post(
    "http://localhost:8000/powerbi/reports",
    json=new_report,
    headers=headers
)
report_id = response.json()["id"]

# Delete report
response = requests.delete(
    f"http://localhost:8000/powerbi/reports/{report_id}",
    headers=headers
)
```

### JavaScript/Fetch
```javascript
const token = sessionStorage.getItem('token');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};

// Get all reports
fetch('/powerbi/reports', { headers })
  .then(r => r.json())
  .then(data => console.log(data.reports));

// Add report
fetch('/powerbi/reports', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    title: "New Report",
    embed_url: "https://...",
    enabled: true
  })
}).then(r => r.json()).then(data => console.log(data.id));

// Delete report
fetch('/powerbi/reports/3', {
  method: 'DELETE',
  headers
}).then(r => r.json()).then(data => console.log(data.message));
```

---

## Webhooks & Events

Not currently implemented. Consider adding for production:
- Report created event
- Report deleted event
- Report viewed event
- Could trigger external notifications/logging

---

## Documentation Version

- **API Version**: 1.0
- **Last Updated**: 2024-01-17
- **Status**: Production Ready
