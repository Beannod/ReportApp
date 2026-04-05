/* ============================================================
   ReportApp - SQL Server Setup (tables, views, procedures)
   Run this in your target database, e.g.:

   USE ReportApp;
   GO
   ============================================================ */

---------------------------------------------------------------
-- 0. Select database (edit if needed)
---------------------------------------------------------------
USE ReportApp;
GO

---------------------------------------------------------------
-- 1. USERS TABLE
---------------------------------------------------------------
IF OBJECT_ID('dbo.users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.users (
        id            INT IDENTITY(1,1) PRIMARY KEY,
        username      NVARCHAR(100) NOT NULL UNIQUE,
        password_hash NVARCHAR(255) NOT NULL,
        role          NVARCHAR(50)  NOT NULL DEFAULT 'user',
        created_at    DATETIME2     NULL
    );
END;
GO


---------------------------------------------------------------
-- 2. IMPORT_LOG TABLE (Comprehensive logging)
---------------------------------------------------------------
IF OBJECT_ID('dbo.import_log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.import_log (
        id                  INT IDENTITY(1,1) PRIMARY KEY,
        
        -- File Information
        file_name           NVARCHAR(255) NULL,
        file_size           BIGINT        NULL,
        file_type           NVARCHAR(20)  NULL,
        sheet_name          NVARCHAR(255) NULL,
        file_hash           NVARCHAR(64)  NULL,
        
        -- Target Information
        table_name          NVARCHAR(255) NULL,
        database_name       NVARCHAR(255) NULL,
        create_new_table    BIT           NULL,
        
        -- Data Metrics
        rows_total          INT           NULL,
        rows_imported       INT           NULL,
        rows_skipped        INT           NULL,
        columns_imported    INT           NULL,
        column_names        NVARCHAR(MAX) NULL,
        column_types        NVARCHAR(MAX) NULL,
        
        -- User & Session
        user_name           NVARCHAR(100) NULL,
        user_ip             NVARCHAR(45)  NULL,
        session_id          NVARCHAR(100) NULL,
        
        -- Status & Errors
        status              NVARCHAR(50)  NULL,
        error_message       NVARCHAR(MAX) NULL,
        error_row           INT           NULL,
        warning_count       INT           NULL,
        warnings            NVARCHAR(MAX) NULL,
        
        -- Timing
        started_at          DATETIME2     NULL,
        finished_at         DATETIME2     NULL,
        duration_ms         INT           NULL,
        
        -- Duplicate Detection
        is_duplicate        BIT           NULL,
        previous_import_id  INT           NULL,
        
        -- Action Notes (tracks what happened: deleted rows, overwrites, etc.)
        action_notes        NVARCHAR(MAX) NULL
    );
END
ELSE
BEGIN
    -- Add new columns if they don't exist
    IF COL_LENGTH('dbo.import_log', 'table_name') IS NULL
        ALTER TABLE dbo.import_log ADD table_name NVARCHAR(255) NULL;

    IF COL_LENGTH('dbo.import_log', 'user_name') IS NULL
        ALTER TABLE dbo.import_log ADD user_name NVARCHAR(100) NULL;

    IF COL_LENGTH('dbo.import_log', 'file_size') IS NULL
        ALTER TABLE dbo.import_log ADD file_size BIGINT NULL;

    IF COL_LENGTH('dbo.import_log', 'rows_imported') IS NULL
        ALTER TABLE dbo.import_log ADD rows_imported INT NULL;

    IF COL_LENGTH('dbo.import_log', 'status') IS NULL
        ALTER TABLE dbo.import_log ADD status NVARCHAR(50) NULL;

    IF COL_LENGTH('dbo.import_log', 'started_at') IS NULL
        ALTER TABLE dbo.import_log ADD started_at DATETIME2 NULL;

    IF COL_LENGTH('dbo.import_log', 'finished_at') IS NULL
        ALTER TABLE dbo.import_log ADD finished_at DATETIME2 NULL;
        
    -- New comprehensive columns
    IF COL_LENGTH('dbo.import_log', 'file_type') IS NULL
        ALTER TABLE dbo.import_log ADD file_type NVARCHAR(20) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'sheet_name') IS NULL
        ALTER TABLE dbo.import_log ADD sheet_name NVARCHAR(255) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'file_hash') IS NULL
        ALTER TABLE dbo.import_log ADD file_hash NVARCHAR(64) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'database_name') IS NULL
        ALTER TABLE dbo.import_log ADD database_name NVARCHAR(255) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'create_new_table') IS NULL
        ALTER TABLE dbo.import_log ADD create_new_table BIT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'rows_total') IS NULL
        ALTER TABLE dbo.import_log ADD rows_total INT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'rows_skipped') IS NULL
        ALTER TABLE dbo.import_log ADD rows_skipped INT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'columns_imported') IS NULL
        ALTER TABLE dbo.import_log ADD columns_imported INT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'column_names') IS NULL
        ALTER TABLE dbo.import_log ADD column_names NVARCHAR(MAX) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'column_types') IS NULL
        ALTER TABLE dbo.import_log ADD column_types NVARCHAR(MAX) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'user_ip') IS NULL
        ALTER TABLE dbo.import_log ADD user_ip NVARCHAR(45) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'session_id') IS NULL
        ALTER TABLE dbo.import_log ADD session_id NVARCHAR(100) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'error_message') IS NULL
        ALTER TABLE dbo.import_log ADD error_message NVARCHAR(MAX) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'error_row') IS NULL
        ALTER TABLE dbo.import_log ADD error_row INT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'warning_count') IS NULL
        ALTER TABLE dbo.import_log ADD warning_count INT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'warnings') IS NULL
        ALTER TABLE dbo.import_log ADD warnings NVARCHAR(MAX) NULL;
        
    IF COL_LENGTH('dbo.import_log', 'duration_ms') IS NULL
        ALTER TABLE dbo.import_log ADD duration_ms INT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'is_duplicate') IS NULL
        ALTER TABLE dbo.import_log ADD is_duplicate BIT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'previous_import_id') IS NULL
        ALTER TABLE dbo.import_log ADD previous_import_id INT NULL;
        
    IF COL_LENGTH('dbo.import_log', 'action_notes') IS NULL
        ALTER TABLE dbo.import_log ADD action_notes NVARCHAR(MAX) NULL;
END;
GO

-- Add useful indexes for import_log
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_import_log_file_name')
    CREATE INDEX IX_import_log_file_name ON dbo.import_log(file_name);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_import_log_table_name')
    CREATE INDEX IX_import_log_table_name ON dbo.import_log(table_name);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_import_log_user_name')
    CREATE INDEX IX_import_log_user_name ON dbo.import_log(user_name);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_import_log_started_at')
    CREATE INDEX IX_import_log_started_at ON dbo.import_log(started_at DESC);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_import_log_status')
    CREATE INDEX IX_import_log_status ON dbo.import_log(status);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_import_log_file_hash')
    CREATE INDEX IX_import_log_file_hash ON dbo.import_log(file_hash);
GO


---------------------------------------------------------------
-- 3. USER_PERMISSIONS TABLE
---------------------------------------------------------------
IF OBJECT_ID('dbo.user_permissions', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.user_permissions (
        id              INT IDENTITY(1,1) PRIMARY KEY,
        user_id         INT           NOT NULL,
        permission_name NVARCHAR(100) NOT NULL,
        granted         BIT           NOT NULL DEFAULT 1,
        granted_by      NVARCHAR(100) NULL,
        granted_at      DATETIME2     DEFAULT GETDATE(),
        
        CONSTRAINT FK_user_permissions_user FOREIGN KEY (user_id) REFERENCES dbo.users(id) ON DELETE CASCADE,
        CONSTRAINT UQ_user_permission UNIQUE (user_id, permission_name)
    );
END;
GO

-- Create index for faster permission lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_user_permissions_user_id')
    CREATE INDEX IX_user_permissions_user_id ON dbo.user_permissions(user_id);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_user_permissions_permission_name')
    CREATE INDEX IX_user_permissions_permission_name ON dbo.user_permissions(permission_name);
GO

-- Insert default permissions list (for reference)
-- Available permissions:
--   import_data      - Can import data files
--   create_table     - Can create new tables
--   delete_table     - Can delete tables
--   run_reports      - Can run reports
--   view_powerbi     - Can view Power BI reports
--   manage_reports   - Can create/edit report definitions
--   view_dashboard   - Can view dashboard

---------------------------------------------------------------
-- 4. REPORT_LOG TABLE
---------------------------------------------------------------
IF OBJECT_ID('dbo.report_log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.report_log (
        id           INT IDENTITY(1,1) PRIMARY KEY,
        report_name  NVARCHAR(255) NULL,
        parameters   NVARCHAR(MAX) NULL,
        status       NVARCHAR(50)  NULL,
        started_at   DATETIME2     NULL,
        finished_at  DATETIME2     NULL
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.report_log', 'parameters') IS NULL
        ALTER TABLE dbo.report_log ADD parameters NVARCHAR(MAX) NULL;

    IF COL_LENGTH('dbo.report_log', 'status') IS NULL
        ALTER TABLE dbo.report_log ADD status NVARCHAR(50) NULL;

    IF COL_LENGTH('dbo.report_log', 'started_at') IS NULL
        ALTER TABLE dbo.report_log ADD started_at DATETIME2 NULL;

    IF COL_LENGTH('dbo.report_log', 'finished_at') IS NULL
        ALTER TABLE dbo.report_log ADD finished_at DATETIME2 NULL;
END;
GO


---------------------------------------------------------------
-- 4. VIEW: vw_ImportLog_Recent
--    Shows latest imports with basic info
---------------------------------------------------------------
IF OBJECT_ID('dbo.vw_ImportLog_Recent', 'V') IS NOT NULL
    DROP VIEW dbo.vw_ImportLog_Recent;
GO

CREATE VIEW dbo.vw_ImportLog_Recent
AS
SELECT TOP 100
    id,
    file_name,
    table_name,
    user_name,
    file_size,
    rows_imported,
    status,
    started_at,
    finished_at
FROM dbo.import_log
ORDER BY started_at DESC, id DESC;
GO


---------------------------------------------------------------
-- 5. PROCEDURE: sp_ReportApp_DashboardSummary
--    Used by /dashboard/summary to populate tiles
---------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.sp_ReportApp_DashboardSummary
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        (SELECT COUNT(*) FROM dbo.users)                    AS TotalUsers,
        (SELECT ISNULL(SUM(rows_imported), 0)
           FROM dbo.import_log
          WHERE status = 'success')                         AS ImportedRows,
        (SELECT MAX(finished_at)
           FROM dbo.import_log
          WHERE status = 'success')                         AS LastImportAt,
        (SELECT COUNT(*)
           FROM dbo.report_log
          WHERE status = 'success')                         AS ReportsRun,
        (SELECT MAX(finished_at)
           FROM dbo.report_log
          WHERE status = 'success')                         AS LastReportAt;
END;
GO
