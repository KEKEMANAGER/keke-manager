# Vehicle seed — Supabase SQL Editor (9 parts)

Run **in order** in the same SQL Editor tab:

| Order | File | Content |
|-------|------|---------|
| 1 | `part01_makes.sql` | `BEGIN` + 105 makes |
| 2 | `part02_models.sql` | Models Toyota → Audi (250) |
| 3 | `part03_models.sql` | Audi → Tesla |
| 4 | `part04_models.sql` | Tesla → Bentley |
| 5 | `part05_models.sql` | Bentley → BYD |
| 6 | `part06_models.sql` | BYD → Mercedes-Benz Vans |
| 7 | `part07_models.sql` | Vans → LDV |
| 8 | `part08_models.sql` | Coaches |
| 9 | `part09_models.sql` | Special + `COMMIT` |
| 10 | `part99_verify.sql` | COUNT check |

**PowerShell — copy one file to clipboard:**

```powershell
Get-Content "d:\keke-manager-app\supabase\seed\parts\part01_makes.sql" | Set-Clipboard
```

**PowerShell — merge ALL parts into one file:**

```powershell
$dir = "d:\keke-manager-app\supabase\seed\parts"
$files = @("part01_makes.sql") + (2..9 | ForEach-Object { "part{0:D2}_models.sql" -f $_ }) + @("part99_verify.sql")
$files | ForEach-Object { Get-Content (Join-Path $dir $_) } | Set-Content "d:\keke-manager-app\supabase\seed\vehicles_makes_models_safe_merged.sql"
```

Expected after success: **105 makes**, **1950 models**.
