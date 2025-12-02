# PowerShell script to import Excel data to SQL Server
# Requires: ImportExcel, SqlServer modules


# PowerShell script to import Excel data to SQL Server
# Requires: ImportExcel, SqlServer modules


param(
    [Parameter(Mandatory=$true)]
    [string]$ExcelPath
)

if (-not (Test-Path $ExcelPath)) {
    Write-Host "Excel file not found: $ExcelPath"
    Write-Host "Usage: .\import_excel_to_sql.ps1 -ExcelPath <path-to-file.xlsx>"
    exit 1
}

 # Extract table name from file name and always use brackets
$rawTableName = [System.IO.Path]::GetFileNameWithoutExtension($ExcelPath)
$tableName = "[$rawTableName]"
$server = 'DESKTOP-LB9B6I4\SQLEXPRESS'
$database = 'ReportApp'
$connectionString = "Server=$server;Database=$database;Trusted_Connection=True;TrustServerCertificate=True;"

# Import Excel data
Import-Module ImportExcel
$data = Import-Excel -Path $ExcelPath

# Get column names from first row
$columns = $data[0].psobject.Properties.Name


# Build CREATE TABLE statement
$colsSql = ($columns | ForEach-Object { "[$_] NVARCHAR(MAX)" }) -join ','
$createTableSql = "IF OBJECT_ID('$rawTableName', 'U') IS NULL CREATE TABLE $tableName ($colsSql);"

# Create table if not exists, with error handling
try {
    Invoke-Sqlcmd -ConnectionString $connectionString -Query $createTableSql
} catch {
    Write-Host "Error creating table: $($_.Exception.Message)"
    exit 1
}

# Convert to DataTable
$table = New-Object System.Data.DataTable
foreach ($col in $columns) {
    $table.Columns.Add($col) | Out-Null
}
foreach ($row in $data) {
    $dr = $table.NewRow()
    foreach ($col in $columns) {
        $dr[$col] = $row.$col
    }
    $table.Rows.Add($dr)
}


# Bulk insert to SQL Server
Import-Module SqlServer
$bulk = New-Object Data.SqlClient.SqlBulkCopy($connectionString)
$bulk.DestinationTableName = $tableName
try {
    $bulk.WriteToServer($table)
} catch {
    Write-Host "Error during bulk insert: $($_.Exception.Message)"
    exit 1
}

Write-Host "Import complete!"