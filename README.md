# Project Overview

ReportApp is a robust application for generating and managing reports efficiently. This project aims to simplify the reporting process and increase productivity in data handling.

## Features
- User authentication via JWT
- PDF report generation
- Data import/export capabilities
- Integration with Power BI for advanced analytics

## Architecture
The application is built using a microservices architecture that allows for modular development and easy scalability.

## Workflow
1. User logs in.
2. Data is imported from different sources.
3. Reports are generated based on the imported data.
4. Users can export reports to various formats.

## Setup Instructions
### Windows + venv + uvicorn
1. Install Python and pip.
2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```
3. Activate the virtual environment:
   ```bash
   venv\Scripts\activate
   ```
4. Install required packages:
   ```bash
   pip install -r requirements.txt
   ```
5. Run the server:
   ```bash
   uvicorn main:app --reload
   ```

## Configuration
### settings.json
- The `settings.json` file contains configuration settings for the application. Make sure to adjust the parameters according to your environment.

### SQL Server ODBC/pyodbc Requirements
- Install the ODBC Driver for SQL Server.
- Ensure pyodbc is included in your `requirements.txt` or installed via pip:
   ```bash
   pip install pyodbc
   ```

## Key Endpoints Summary
- `/api/login`: User authentication
- `/api/reports`: Create and retrieve reports
- `/api/data/import`: Import data sources

## Security Notes
- Make sure to set a strong JWT_SECRET in your environment variables.
- Default credentials are admin/admin. Change them upon installation.

## Quick Start
1. Clone the repository:
   ```bash
   git clone https://github.com/Beannod/ReportApp.git
   ```
2. Follow the setup instructions above to get started.

## App Workflow
- The application workflow guides users through data importing to report generation seamlessly.

## Project Structure
```
ReportApp/
│
├── main.py
├── models/
├── routes/
├── templates/
├── static/
└── requirements.txt
```

## Running Reports
- Navigate to the reports section of the application to run and schedule reports.

## Importing Data
- Use the `/api/data/import` endpoint to import data files in various formats.

## Power BI (optional)
- Connect your reports with Power BI for enhanced data visualization.

## Troubleshooting
- Common issues can be found in the `TR troubleshooting.md`. If problems persist, refer to the community forums.

## Roadmap/Next Steps
- Implement additional report formats.
- Enhance user authentication.
- Improve data visualization options.

## License
- This project is licensed under the MIT License. See the LICENSE file for details.

## Documentation
- For more software details, refer to [SOFTWARE_DOCUMENTATION.md](SOFTWARE_DOCUMENTATION.md)  
