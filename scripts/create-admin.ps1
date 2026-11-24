$ErrorActionPreference = 'Stop'

$container = docker ps --format '{{.Names}}' | Where-Object {
    $_ -in @('gateshield-gateway', 'gateshield-gateway-prod')
} | Select-Object -First 1

if (-not $container) {
    throw "Gateway container is not running."
}

$username = Read-Host "Enter new admin username"

if ($username -notmatch '^[A-Za-z0-9_.-]{3,50}$') {
    throw "Invalid username."
}

$securePassword = Read-Host "Enter admin password (minimum 12 characters)" -AsSecureString
$bstr = [IntPtr]::Zero
$plain = $null

try {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

    if ($plain.Length -lt 12) {
        throw "Password must contain at least 12 characters."
    }

    docker cp "$PSScriptRoot\create-admin.js" "${container}:/app/create-admin.js"

    if ($LASTEXITCODE -ne 0) {
        throw "Could not copy bootstrap script."
    }

   $plain | docker exec -i $container node /app/create-admin.js $username

    if ($LASTEXITCODE -ne 0) {
        throw "Admin bootstrap failed."
    }
}
finally {
    if ($bstr -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    $plain = $null
    $securePassword = $null
}
