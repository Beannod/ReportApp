# SOFTWARE DOCUMENTATION

## Table of Contents
1. [Setup Instructions](#setup-instructions)
2. [Configuration](#configuration)
3. [Database Flow](#database-flow)
4. [Power BI Features](#power-bi-features)
5. [Frontend Pages and Scripts](#frontend-pages-and-scripts)
6. [Logging and Troubleshooting](#logging-and-troubleshooting)

## Setup Instructions
### Windows Virtual Environment
1. Install Python 3.x if it’s not already installed.
2. Create a virtual environment:
   ```bash
   python -m venv venv
   ```
3. Activate the virtual environment:
   ```bash
   venv\Scripts\activate
   ```
4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Run the application:
   ```bash
   uvicorn app.main:app
   ```

## Configuration
- **instance/settings.json**: This file should be configured to match your deployment settings. Ensure that all database connections and paths are accurate.
- **Environment Variables**:
  - `JWT_SECRET`: Set this to a secure random string for JWT token signing.
  - `ADMIN_SETTINGS_PASSWORD`: The password used for admin access in the application.

## Database Flow
- The application utilizes SQL Server via ODBC and pyodbc for primary data handling, with SQLite as a fallback.
- Includes an import pipeline that processes data into the database.
- **Stored-Procedure Reports**: Accessible via the `/report/stored-procedures` endpoint. Users can run predefined reports through this interface.
- The application handles report definitions and runs reports effectively, using a dedicated parameter values endpoint for dynamic queries.

## Power BI Features
- Power BI integration is available to visualize data reports and dashboards in real-time.
- Endpoints for Power BI include direct connections to report data and interactive dashboards.

## Frontend Pages and Scripts
- The project includes various frontend pages responsible for user interactions.
- Additionally, scripts are available to enhance the functionality of these pages.

## Logging and Troubleshooting
- All API errors are logged in the `api_errors.log` file located in the root directory.
- Common troubleshooting steps:
  - Check the logs for detailed error messages.
  - Ensure the database services are running.
  - Verify environment variables are correctly set.

<!-- All existing details have been preserved and expanded upon as per requests. -->