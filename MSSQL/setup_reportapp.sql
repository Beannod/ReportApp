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
-- 2. IMPORT_LOG TABLE
---------------------------------------------------------------
IF OBJECT_ID('dbo.import_log', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.import_log (
        id            INT IDENTITY(1,1) PRIMARY KEY,
        file_name     NVARCHAR(255) NULL,
        table_name    NVARCHAR(255) NULL,
        user_name     NVARCHAR(100) NULL,
        file_size     BIGINT        NULL,
        rows_imported INT           NULL,
        status        NVARCHAR(50)  NULL,
        started_at    DATETIME2     NULL,
        finished_at   DATETIME2     NULL
    );
END
ELSE
BEGIN
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
END;
GO


---------------------------------------------------------------
-- 3. REPORT_LOG TABLE
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
