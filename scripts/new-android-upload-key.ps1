[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$KeystorePath,
    [string]$Alias = 'rollersmaps-upload',
    [string]$JavaHome = $env:JAVA_HOME
)

$ErrorActionPreference = 'Stop'
$projectPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\', '/')
$keyPath = [IO.Path]::GetFullPath($KeystorePath)
if ($keyPath.StartsWith($projectPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'La clave privada debe guardarse fuera del proyecto y de Git.'
}
if (Test-Path -LiteralPath $keyPath) { throw 'La ruta ya existe. Conserva y reutiliza tu clave; no se sobrescribe.' }
if (!$JavaHome) { throw 'Indica -JavaHome con tu JDK 17 o configura JAVA_HOME.' }
$keytool = Join-Path $JavaHome 'bin\keytool.exe'
if (!(Test-Path -LiteralPath $keytool)) { throw 'No se encuentra keytool en el JDK indicado.' }
if ($Alias -eq 'androiddebugkey') { throw 'No uses una identidad de firma de prueba.' }

$password = Read-Host 'Nueva contrasena para la clave de carga (minimo 12 caracteres)' -AsSecureString
$confirmation = Read-Host 'Repite la contrasena' -AsSecureString
$pointer = [IntPtr]::Zero
$confirmationPointer = [IntPtr]::Zero
try {
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
    $confirmationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmation)
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $plainConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationPointer)
    if ($plainPassword.Length -lt 12 -or $plainPassword -cne $plainConfirmation) { throw 'Las contrasenas deben coincidir y tener al menos 12 caracteres.' }
    $env:RM_UPLOAD_CREATE_PASSWORD = $plainPassword
    $keyParent = Split-Path -Parent $keyPath
    if (!(Test-Path -LiteralPath $keyParent)) { New-Item -ItemType Directory -Path $keyParent | Out-Null }
    & $keytool -genkeypair -v -storetype PKCS12 -keystore $keyPath -alias $Alias -keyalg RSA -keysize 2048 -validity 10000 -dname 'CN=RollersMaps Upload, O=RollersMaps, C=CL' -storepass:env RM_UPLOAD_CREATE_PASSWORD -keypass:env RM_UPLOAD_CREATE_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo crear la clave de carga.' }
    $certificateListing = & $keytool -J-Duser.language=en -J-Duser.country=US -list -v -keystore $keyPath -alias $Alias -storepass:env RM_UPLOAD_CREATE_PASSWORD
    if ($LASTEXITCODE -ne 0) { throw 'La clave se creo, pero no se pudo consultar su certificado. Conserva el archivo y verifica el certificado antes de continuar.' }
    $sha1Match = $certificateListing | Select-String -Pattern 'SHA1:\s*((?:[A-F0-9]{2}:){19}[A-F0-9]{2})' | Select-Object -First 1
    if (!$sha1Match) { throw 'La clave se creo, pero no se pudo identificar la huella SHA-1 del certificado. Conserva el archivo y verifica su certificado.' }
    Write-Host ('SHA-1 del certificado de carga: ' + $sha1Match.Matches.Groups[1].Value)
    Write-Host 'Google Cloud: restringe la clave Maps SDK para Android a cl.santiagorollers.rollersmaps y esta huella SHA-1 para probar el APK.'
    Write-Host 'Al distribuir mediante Google Play, agrega tambien la huella SHA-1 del certificado de firma de aplicaciones de Play Console.'
    Write-Host 'Clave creada. Guarda una copia segura de este archivo y su contrasena en tu gestor de contrasenas.'
    Write-Host 'Reutiliza esta misma clave de carga para todas las siguientes versiones.'
} finally {
    Remove-Item Env:\RM_UPLOAD_CREATE_PASSWORD -ErrorAction SilentlyContinue
    $plainPassword = $null
    $plainConfirmation = $null
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    if ($confirmationPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationPointer) }
    $password.Dispose()
    $confirmation.Dispose()
}
