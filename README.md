# README

## Overview
This application consists of a FastAPI backend coupled with a static frontend. This architecture allows for a streamlined experience for users, providing efficient API responses and an engaging user interface.

## Features
- **JWT Authentication**: Secure user authentication is implemented using JSON Web Tokens (JWT).
- **Import CSV/XLSX**: Users can import CSV and XLSX files with a preview of the data, complete with logging and duplicate record handling.
- **Report Definitions**: Reports can be defined based on stored procedures, enabling complex data retrieval and report generation.
- **Run Reports**: Users can trigger reports to execute based on their defined parameters.
- **Parameter Dropdown Lookup**: Dynamic dropdowns allow for parameter selections in reports, enhancing user interaction.
- **Power BI Embed Management**: Easily manage embedded Power BI reports within the application.
- **Admin/Settings Interface**: An administrative interface is provided for managing settings and user permissions.
- **Diagnostics**: Tools for diagnostics help in monitoring the application’s health and performance.

## Architecture
The application is structured into three main components:
- **app/**: Contains the backend FastAPI application.
- **frontend/**: Contains the static frontend files.
- **settings.json**: Configuration settings for the application.

## Database Flow
The application primarily uses SQL Server via ODBC/pyodbc, with SQLite as a fallback option. This allows flexibility depending on the user's environment.

## Setup Instructions
1. **Windows Virtual Environment**:
   - Set up a virtual environment using `venv`.
2. **Install Required Packages**:
   - Run the command: `pip install -r requirements.txt` to install dependencies.
3. **Run the Application**:
   - Execute the application with `uvicorn app.main:app`.

## Configuration
- Instance settings are found in `instance/settings.json`.
- Environment variables include `JWT_SECRET` for JWT authentication and `ADMIN_SETTINGS_PASSWORD` for the admin panel.

## Endpoints Summary
- **/login**: Authenticate users and return a JWT.
- **/import-data**: Endpoint for importing data from CSV/XLSX files.
- **/report/run**: Trigger report generation based on user-defined parameters.

## Security Notes
- The default admin username and password are both set to `admin`. It's crucial to change these credentials immediately to secure the application.

## Logs/Debugging Notes
Monitor the application’s logs for any debugging information that may require attention.

## Documentation Link
For further details and documentation, please refer to [SOFTWARE_DOCUMENTATION.md](SOFTWARE_DOCUMENTATION.md).