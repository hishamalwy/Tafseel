$files = Get-ChildItem -Path . -Filter '*.dc.html'
$all = @()
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    $ms = [regex]::Matches($content, 'data-i18n(-ph)?="([^"]*)"')
    foreach ($m in $ms) {
        $all += [PSCustomObject]@{File=$f.Name; Attr=$(if($m.Groups[1].Value){'data-i18n-ph'}else{'data-i18n'}); Key=$m.Groups[2].Value}
    }
}
$all | Export-Csv -Path 'i18n_usage.csv' -NoTypeInformation
Write-Output "TotalUsages=$($all.Count) UniqueKeys=$(($all | Select-Object -ExpandProperty Key -Unique).Count)"

$c = Get-Content 'js\locales.js'
$enBlock = $c[5..1660]
$enKeys = New-Object System.Collections.Generic.List[string]
foreach ($l in $enBlock) {
    if ($l -match '^\s*"([^"]+)":') {
        $enKeys.Add($Matches[1])
    }
}
$enKeys | Set-Content 'locales_en_keys.txt'
Write-Output "EnKeysCount=$($enKeys.Count)"

$uniqueUsageKeys = $all | Select-Object -ExpandProperty Key -Unique
$missing = $uniqueUsageKeys | Where-Object { $enKeys -notcontains $_ }
Write-Output "MissingCount=$($missing.Count)"
$missing | Set-Content 'missing_i18n_keys.txt'
