[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$KeystorePath,
    [string]$Alias = 'rollersmaps-upload',
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$AndroidHome = $env:ANDROID_HOME,
    [string]$GoogleMapsApiKey = $env:GOOGLE_MAPS_ANDROID_API_KEY,
    [Security.SecureString]$SigningPassword
)

$ErrorActionPreference = 'Stop'

function Set-RollersMapsDaemonJava17 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $existed = [IO.File]::Exists($Path)
    $temporaryBytes = [Text.Encoding]::UTF8.GetBytes("# Temporary RollersMaps release daemon criteria`ntoolchainVersion=17`n")
    $stream = [IO.File]::Open($Path, [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, ([IO.FileShare]::Read -bor [IO.FileShare]::Delete))
    $originalBuffer = New-Object IO.MemoryStream
    try {
        $stream.CopyTo($originalBuffer)
        $originalBytes = $originalBuffer.ToArray()
        # Preserve a file created by another process between the existence check and open.
        if ($originalBytes.Length -gt 0) { $existed = $true }
        try {
            $stream.Position = 0
            $stream.SetLength(0)
            $stream.Write($temporaryBytes, 0, $temporaryBytes.Length)
            $stream.Flush()
        } catch {
            $stream.Position = 0
            $stream.SetLength(0)
            $stream.Write($originalBytes, 0, $originalBytes.Length)
            $stream.Flush()
            if (!$existed) { [IO.File]::Delete($Path) }
            throw
        }
        return [PSCustomObject]@{ Path = $Path; Existed = $existed; OriginalBytes = $originalBytes; TemporaryBytes = $temporaryBytes }
    } finally {
        $originalBuffer.Dispose()
        $stream.Dispose()
    }
}

function Restore-RollersMapsDaemonCriteria {
    param([Parameter(Mandatory = $true)]$State)
    if (![IO.File]::Exists($State.Path)) {
        Write-Warning 'El criterio JVM fue eliminado durante la compilacion; se conserva ese cambio externo.'
        return
    }
    # Check and restore under one file handle; another writer cannot race this check.
    $stream = [IO.File]::Open($State.Path, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, ([IO.FileShare]::Read -bor [IO.FileShare]::Delete))
    $currentBuffer = New-Object IO.MemoryStream
    try {
        $stream.CopyTo($currentBuffer)
        if ([Convert]::ToBase64String($currentBuffer.ToArray()) -cne [Convert]::ToBase64String($State.TemporaryBytes)) {
            Write-Warning 'El criterio JVM cambio durante la compilacion; se conserva la configuracion externa y no se sobrescribe.'
            return
        }
        if ($State.Existed) {
            $stream.Position = 0
            $stream.SetLength(0)
            $stream.Write($State.OriginalBytes, 0, $State.OriginalBytes.Length)
            $stream.Flush()
        } else {
            # Delete while the handle prevents writes, preserving the original absence.
            [IO.File]::Delete($State.Path)
        }
    } finally {
        $currentBuffer.Dispose()
        $stream.Dispose()
    }
}

$projectPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$JavaHome -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) { throw 'Indica -JavaHome con tu JDK 17.' }
if (!(Test-Path -LiteralPath (Join-Path $JavaHome 'bin\keytool.exe')) -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin\jarsigner.exe'))) { throw '-JavaHome debe apuntar al JDK 17 completo, con keytool y jarsigner.' }
$javaVersion = & (Join-Path $JavaHome 'bin\java.exe') --version
if ($LASTEXITCODE -ne 0 -or ($javaVersion -join "`n") -notmatch '(?m)^(?:openjdk|java) 17(?:\.|\s)') { throw '-JavaHome debe apuntar a un JDK version 17.' }
if (!$AndroidHome -or !(Test-Path -LiteralPath (Join-Path $AndroidHome 'build-tools\36.0.0\aapt.exe'))) { throw 'Indica -AndroidHome con Android SDK y Build Tools 36.0.0.' }
if (!$GoogleMapsApiKey) {
    # Capture only this value in memory; do not print the key or dotenv contents.
    Push-Location -LiteralPath $projectPath
    try {
        $GoogleMapsApiKey = & node -e "process.env.NODE_ENV='production';require('@expo/env').load(process.cwd(),{silent:true});process.stdout.write(process.env.GOOGLE_MAPS_ANDROID_API_KEY||'');"
        if ($LASTEXITCODE -ne 0) { throw 'No se pudo leer la configuracion local de Maps.' }
    } finally { Pop-Location }
}
if (!$GoogleMapsApiKey -or $GoogleMapsApiKey -notmatch '^AIza[0-9A-Za-z_-]{35}$') { throw 'Configura GOOGLE_MAPS_ANDROID_API_KEY valida en .env.local o en el entorno, restringida a Maps SDK para Android.' }
if (!(Test-Path -LiteralPath $KeystorePath -PathType Leaf)) { throw 'Primero crea tu clave con scripts/new-android-upload-key.ps1.' }

$envNames = @('JAVA_HOME', 'ANDROID_HOME', 'PATH', 'NODE_ENV', 'CMAKE_BUILD_PARALLEL_LEVEL', 'ROLLERSMAPS_ANDROID_KEYSTORE_PATH', 'ROLLERSMAPS_ANDROID_KEY_ALIAS', 'ROLLERSMAPS_ANDROID_STORE_PASSWORD', 'ROLLERSMAPS_ANDROID_KEY_PASSWORD', 'GOOGLE_MAPS_ANDROID_API_KEY')
$previousEnvironment = @{}
foreach ($name in $envNames) { $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
$password = if ($SigningPassword) { $SigningPassword.Copy() } else { Read-Host 'Contrasena de la clave de carga' -AsSecureString }
$pointer = [IntPtr]::Zero
$daemonCriteriaState = $null
Push-Location -LiteralPath $projectPath
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $env:ROLLERSMAPS_ANDROID_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    # The provided key creation script uses one password for the PKCS12 store and key.
    $env:ROLLERSMAPS_ANDROID_KEY_PASSWORD = $env:ROLLERSMAPS_ANDROID_STORE_PASSWORD
    $env:ROLLERSMAPS_ANDROID_KEYSTORE_PATH = (Resolve-Path -LiteralPath $KeystorePath).Path
    $env:ROLLERSMAPS_ANDROID_KEY_ALIAS = $Alias
    $env:GOOGLE_MAPS_ANDROID_API_KEY = $GoogleMapsApiKey
    $env:JAVA_HOME = $JavaHome
    $env:ANDROID_HOME = $AndroidHome
    $env:PATH = (Join-Path $JavaHome 'bin') + [IO.Path]::PathSeparator + $env:PATH
    $env:NODE_ENV = 'production'
    $env:CMAKE_BUILD_PARALLEL_LEVEL = '1'

    & node scripts/prepare-android-release.mjs --validate-only
    if ($LASTEXITCODE -ne 0) { throw 'La configuracion de publicacion esta incompleta.' }
    & node scripts/verify.mjs
    if ($LASTEXITCODE -ne 0) { throw 'La verificacion de la aplicacion fallo.' }
    & node node_modules/expo/bin/cli prebuild --platform android --no-install --no-clean
    if ($LASTEXITCODE -ne 0) { throw 'Expo no pudo preparar Android.' }
    & node scripts/prepare-android-release.mjs --write-native
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo preparar la firma Android.' }
    # Capture the actual file after prebuild and restore its exact bytes/existence.
    $daemonCriteriaState = Set-RollersMapsDaemonJava17 -Path (Join-Path $projectPath 'android\gradle\gradle-daemon-jvm.properties')
    Push-Location -LiteralPath (Join-Path $projectPath 'android')
    try {
        & .\gradlew.bat :app:bundleRelease :app:assembleRelease --no-daemon --max-workers=1 --console=plain
        if ($LASTEXITCODE -ne 0) { throw 'La compilacion Android fallo.' }
    } finally { Pop-Location }

    $apkPath = Join-Path $projectPath 'android\app\build\outputs\apk\release\app-release.apk'
    $aabPath = Join-Path $projectPath 'android\app\build\outputs\bundle\release\app-release.aab'
    $apkSignature = & (Join-Path $JavaHome 'bin\java.exe') -jar (Join-Path $AndroidHome 'build-tools\36.0.0\lib\apksigner.jar') verify --print-certs $apkPath
    if ($LASTEXITCODE -ne 0 -or ($apkSignature | Select-String -Pattern 'certificate DN:.*CN=Android Debug')) { throw 'La firma APK no supera la validacion de distribucion.' }
    $apkSignature | Write-Host
    $badging = & (Join-Path $AndroidHome 'build-tools\36.0.0\aapt.exe') dump badging $apkPath
    if ($LASTEXITCODE -ne 0 -or ($badging | Select-String -Pattern "^package: name='cl.santiagorollers.rollersmaps' versionCode='32' versionName='1.0.0'").Count -ne 1) {
        throw 'El APK generado no corresponde al paquete y version definitivos.'
    }
    $aabSignature = & (Join-Path $JavaHome 'bin\jarsigner.exe') '-J-Duser.language=en' '-J-Duser.country=US' -verify $aabPath
    if ($LASTEXITCODE -ne 0 -or !($aabSignature | Select-String -Pattern '^jar verified\.')) { throw 'La firma AAB no supera la validacion.' }
    $keytool = Join-Path $JavaHome 'bin\keytool.exe'
    $uploadCertificate = & $keytool '-J-Duser.language=en' '-J-Duser.country=US' -list -v -keystore $env:ROLLERSMAPS_ANDROID_KEYSTORE_PATH -alias $Alias -storepass:env ROLLERSMAPS_ANDROID_STORE_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el certificado de carga.' }
    $uploadFingerprint = ($uploadCertificate | Select-String -Pattern 'SHA256:\s*([A-F0-9:]+)' | Select-Object -First 1).Matches.Groups[1].Value
    $aabCertificate = & $keytool '-J-Duser.language=en' '-J-Duser.country=US' -printcert -jarfile $aabPath
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo verificar el certificado del AAB.' }
    $aabFingerprint = ($aabCertificate | Select-String -Pattern 'SHA256:\s*([A-F0-9:]+)' | Select-Object -First 1).Matches.Groups[1].Value
    if (!$uploadFingerprint -or !$aabFingerprint -or $uploadFingerprint -cne $aabFingerprint) { throw 'El AAB no esta firmado con el certificado de carga indicado.' }
    Write-Host 'Firma AAB verificada y coincide con tu certificado de carga.'
    $outputPath = Join-Path $projectPath 'releases'
    New-Item -ItemType Directory -Path $outputPath -Force | Out-Null
    $deliverApk = Join-Path $outputPath 'RollersMaps-1.0.0-32.apk'
    $deliverAab = Join-Path $outputPath 'RollersMaps-1.0.0-32.aab'
    Copy-Item -LiteralPath $apkPath -Destination $deliverApk -Force
    Copy-Item -LiteralPath $aabPath -Destination $deliverAab -Force
    Get-FileHash -LiteralPath $deliverApk, $deliverAab -Algorithm SHA256 | Select-Object Path, Hash
    Write-Host 'APK para instalacion directa y AAB para Google Play preparados en releases.'
} finally {
    try {
        if ($daemonCriteriaState) { Restore-RollersMapsDaemonCriteria -State $daemonCriteriaState }
    } finally {
        Pop-Location
        foreach ($name in $envNames) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $password.Dispose()
    }
}

