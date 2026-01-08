$timestamp = [math]::Floor([datetime]::UtcNow.Subtract([datetime]'1970-01-01').TotalSeconds)

$body = @{
    object = 'whatsapp_business_account'
    entry = @(@{
        id = 'test'
        changes = @(@{
            value = @{
                messaging_product = 'whatsapp'
                metadata = @{
                    display_phone_number = '1234567890'
                    phone_number_id = 'test'
                }
                messages = @(@{
                    from = '919876543210'
                    id = 'test123'
                    timestamp = $timestamp
                    type = 'text'
                    text = @{
                        body = 'Hi'
                    }
                })
            }
            field = 'messages'
        })
    })
} 

$jsonBody = $body | ConvertTo-Json -Depth 10
Write-Host "Sending test message with timestamp: $timestamp"
Write-Host "JSON Body:`n$jsonBody`n"

try {
    $response = Invoke-RestMethod -Uri 'http://localhost:3000/attendance_callbackurl' -Method Post -Body $jsonBody -ContentType 'application/json'
    Write-Host "✅ Response received:"
    Write-Host ($response | ConvertTo-Json)
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
}
