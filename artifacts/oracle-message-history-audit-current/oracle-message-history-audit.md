# Oracle Message History Audit

- generated_at: 2026-09-19T05:09:00Z
- remote_host: 152.67.110.187
- remote_dir: /home/ubuntu/omnyid
- mode: read_only
- tenant_schemas: 6
- total_messages: 225
- maintenance_summary_messages: 6
- empty_maintenance_summary_messages: 3
- non_maintenance_messages: 219
- maintenance_summary_percent: 2.6667
- empty_maintenance_summary_percent: 1.3333
- claim_currently_true: false

## Conclusion

The current Oracle database does not match the active-spam claim that about 99.9% of message history is the repeating empty `Knowledge maintenance summary`. A live read-only aggregate found 225 total message rows, 6 maintenance-summary rows, and 3 exact empty maintenance-summary rows across 6 tenant schemas.

The companion dry-run cleanup receipt at `artifacts/oracle-prune-synthetic-message-spam-dryrun-current/oracle-prune-synthetic-message-spam.json` also reports 0 duplicate maintenance-summary rows, 0 duplicate synthetic rows total, and 0 rows deleted in dry-run mode.
