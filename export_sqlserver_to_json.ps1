$SqlServer = "JUN"
$Database = "travel"
$User = "sa"
$Password = "Geyijun050725@"

$OutDir = Join-Path (Get-Location) "data_export"
if (!(Test-Path $OutDir)) {
  New-Item -ItemType Directory -Path $OutDir | Out-Null
}

$Tables = @(
  "cities",
  "city_attractions",
  "city_attraction_override",
  "travel_comments",
  "comment_replies",
  "comment_likes"
)

$ConnStr = "Server=$SqlServer;Database=$Database;User ID=$User;Password=$Password;TrustServerCertificate=True;"

Add-Type -AssemblyName System.Data

foreach ($TableName in $Tables) {
  Write-Host "Exporting dbo.$TableName ..."

  $Conn = New-Object System.Data.SqlClient.SqlConnection($ConnStr)
  $Cmd = $Conn.CreateCommand()
  $Cmd.CommandText = "SELECT * FROM dbo.$TableName"

  $Adapter = New-Object System.Data.SqlClient.SqlDataAdapter($Cmd)
  $DataTable = New-Object System.Data.DataTable

  $Conn.Open()
  [void]$Adapter.Fill($DataTable)
  $Conn.Close()

  $Rows = foreach ($Row in $DataTable.Rows) {
    $Obj = [ordered]@{}
    foreach ($Col in $DataTable.Columns) {
      $Value = $Row[$Col.ColumnName]
      if ($Value -is [System.DBNull]) {
        $Value = $null
      }
      $Obj[$Col.ColumnName] = $Value
    }
    [pscustomobject]$Obj
  }

  $Json = $Rows | ConvertTo-Json -Depth 50
  $FilePath = Join-Path $OutDir "$TableName.json"

  $Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($FilePath, $Json, $Utf8NoBom)

  Write-Host "Saved $FilePath, rows: $($DataTable.Rows.Count)"
}

Write-Host "Export finished."