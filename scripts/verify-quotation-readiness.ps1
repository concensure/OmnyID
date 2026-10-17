param(
    [string]$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")),
    [switch]$IncludeBrowser
)

$ErrorActionPreference = "Stop"
$root = (Resolve-Path -LiteralPath $RepositoryRoot).Path
$solidUi = Join-Path $root "solid-ui"
$typescriptSdk = Join-Path $root "typescript-sdk"

Write-Host "Running quotation Rust verification"
Push-Location $root
try {
    cargo test --test quotation_baseline --test quotation_contracts --test quotation_intelligence --test quotation_afp --test quotation_vendor_context --test quotation_vendor_response --test quotation_vendor_response_transport --test quotation_vendor_response_api --test quotation_response_capability --test quotation_response_capability_api --test quotation_extraction --test quotation_review --test quotation_clarification --test quotation_closure --test quotation_closure_evidence --test quotation_decision_api --test quotation_closure_api --test quotation_readiness
    if ($LASTEXITCODE -ne 0) { throw "Quotation Rust verification failed" }
    cargo test --test api_flows
    if ($LASTEXITCODE -ne 0) { throw "Quotation Postgres HTTP verification failed" }
    cargo test --lib quotation
    if ($LASTEXITCODE -ne 0) { throw "Quotation route and prompt unit verification failed" }
    cargo test --lib document_ingest_service
    if ($LASTEXITCODE -ne 0) { throw "Shared document-ingest service verification failed" }
    cargo test --lib gmail_api
    if ($LASTEXITCODE -ne 0) { throw "Gmail threading and provider-receipt verification failed" }
    cargo test --lib wedding_llm_ladder
    if ($LASTEXITCODE -ne 0) { throw "Shared LLM ladder verification failed" }
    cargo check
    if ($LASTEXITCODE -ne 0) { throw "Cargo check failed" }
    git diff --check
    if ($LASTEXITCODE -ne 0) { throw "Git whitespace check failed" }
}
finally {
    Pop-Location
}

Write-Host "Running quotation TypeScript SDK verification"
Push-Location $typescriptSdk
try {
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Quotation SDK type checking failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Quotation SDK build failed" }
    node --test tests/quotation.test.mjs tests/quotation-vendor-response.test.mjs
    if ($LASTEXITCODE -ne 0) { throw "Quotation SDK tests failed" }
}
finally {
    Pop-Location
}

Write-Host "Running quotation Solid verification"
Push-Location $solidUi
try {
    npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw "Solid type checking failed" }
    node --import ./tests/node-ts-specifier-hooks.mjs --experimental-strip-types --test `
        tests/quotation-source-state.test.ts `
        tests/quotation-decision-card.test.ts `
        tests/quotation-review-state.test.ts `
        tests/quotation-clarification-state.test.ts `
        tests/quotation-closure-state.test.ts `
        tests/quotation-decision-closure-state.test.ts `
        tests/quotation-decision-closure-api.test.ts `
        tests/quotation-closure-template-projection.test.ts `
        tests/quotation-wedding-closure-adapter.test.ts `
        tests/vendor-quotation-response-state.test.ts `
        tests/quotation-response-session-api.test.ts `
        tests/quotation-response-form-state.test.ts `
        tests/quotation-readiness-state.test.ts
    if ($LASTEXITCODE -ne 0) { throw "Quotation Solid verification failed" }
    if ($IncludeBrowser) {
        npx playwright test tests/e2e/wedding-quotation-intelligence.spec.ts tests/e2e/quotation-decision-closure.spec.ts tests/e2e/quotation-vendor-response.spec.ts tests/e2e/quotation-response-portal.spec.ts --config playwright.config.ts
        if ($LASTEXITCODE -ne 0) { throw "Quotation browser verification failed" }
    }
}
finally {
    Pop-Location
}

Write-Host "Quotation verification commands passed. Release flags remain controlled by verified evidence and deployment configuration."
