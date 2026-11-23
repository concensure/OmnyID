Set-StrictMode -Version Latest

function Get-OracleRequiredRuntimeScriptPaths {
    return @(
        "scripts/omnyid-backup-verify.sh",
        "scripts/omnyid-backup.sh",
        "scripts/omnyid-migrations-plan.sh",
        "scripts/omnyid-prune-daemon-heartbeats.sh",
        "scripts/oracle-remediate-electric-slot.ps1",
        "scripts/oracle-production-proof.ps1",
        "scripts/omnyid-restore-drill.sh",
        "scripts/omnyid-restore.sh",
        "scripts/omnyid-upgrade.sh",
        "scripts/oracle-renew-wt-cert.sh",
        "scripts/runtime-env-entrypoint.sh",
        "scripts/startup-policy-check.ps1",
        "scripts/startup-policy-check.sh",
        "scripts/verify-deployment.ps1",
        "scripts/verify-deployment.sh"
    )
}
