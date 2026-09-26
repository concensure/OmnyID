// @locs-version: 1.0
// @module-id: ui.tool-catalog
// @primary-capability: third-party-tool-provider-catalog
// @stability: beta
// Normalized tool catalog for OmnyID.
// Each entry's `capabilities` array feeds directly into tool_descriptor.capabilities
// when the user connects the tool, enabling the master agent to use tools by name.

export type CatalogTool = {
  slug: string;
  name: string;
  domain: string;
  category: string;
  description: string;
  capabilities: string[];
  auth_type: "api_key" | "oauth2" | "none";
  mcpDocsUrl?: string;
  apiKeyUrl?: string;
  billing?: {
    provider_key: string;
    provider_category: string;
    billing_category?: string;
    billing_model: "usage" | "subscription" | "hybrid" | "free_dev_only";
    pricing_summary: string;
    free_tier_summary?: string;
    production_caveat?: string;
    pricing_source_url?: string;
    default_usage_unit?: string;
    default_quantity_per_call?: number;
    estimated_cost_usd_per_call?: number;
    capability_metering?: Record<
      string,
      {
        usage_unit?: string;
        quantity?: number;
        estimated_cost_usd?: number;
      }
    >;
  };
};

export const TOOL_CATEGORIES = [
  "Communication",
  "Project Management",
  "Productivity",
  "Storage",
  "Design",
  "Dev & Data",
  "Automation",
  "CRM & Finance",
  "Finance",
  "Payments",
  "Maps & Weather",
  "Travel",
  "Health & Wellness",
  "Analytics",
  "AI & Research",
  "E-commerce",
  "Education",
] as const;

export const CATALOG: CatalogTool[] = [
  // ── Communication ──────────────────────────────────────────────────────────
  { slug: "slack", name: "Slack", domain: "slack.com", category: "Communication", description: "Send messages, search channels, and manage workspaces.", capabilities: ["send_message", "list_channels", "search_messages", "create_channel", "invite_user"], auth_type: "api_key", apiKeyUrl: "https://api.slack.com/apps" },
  { slug: "zoom", name: "Zoom", domain: "zoom.us", category: "Communication", description: "Schedule and manage Zoom meetings.", capabilities: ["create_meeting", "list_meetings", "get_recording", "delete_meeting"], auth_type: "oauth2" },
  { slug: "teams", name: "Microsoft Teams", domain: "teams.microsoft.com", category: "Communication", description: "Create meetings and post messages to Teams channels.", capabilities: ["send_message", "create_meeting", "list_channels", "create_team"], auth_type: "oauth2" },
  { slug: "discord", name: "Discord", domain: "discord.com", category: "Communication", description: "Send messages and manage Discord servers and channels.", capabilities: ["send_message", "list_channels", "create_thread", "pin_message"], auth_type: "api_key" },
  { slug: "telegram", name: "Telegram", domain: "telegram.org", category: "Communication", description: "Send messages and manage Telegram bots and groups.", capabilities: ["send_message", "send_photo", "get_updates", "create_poll"], auth_type: "api_key" },
  { slug: "whatsapp-messenger", name: "WhatsApp", domain: "whatsapp.com", category: "Communication", description: "Connect personal WhatsApp messaging workflows where supported by your bridge.", capabilities: ["send_message", "get_contacts", "list_chats"], auth_type: "api_key" },
  { slug: "whatsapp", name: "WhatsApp Business", domain: "business.whatsapp.com", category: "Communication", description: "Send messages via WhatsApp Business API.", capabilities: ["send_message", "send_template", "get_contacts"], auth_type: "api_key" },
  { slug: "twilio-sms", name: "Twilio", domain: "twilio.com", category: "Communication", description: "Send SMS, voice, verification, and messaging events through Twilio.", capabilities: ["send_sms", "create_call", "verify_user", "list_messages", "lookup_number"], auth_type: "api_key", apiKeyUrl: "https://console.twilio.com/" },
  { slug: "sendgrid", name: "SendGrid", domain: "sendgrid.com", category: "Communication", description: "Send transactional email and manage email templates through SendGrid.", capabilities: ["send_email", "list_templates", "get_stats", "manage_senders"], auth_type: "api_key", apiKeyUrl: "https://app.sendgrid.com/settings/api_keys" },
  { slug: "messagebird", name: "MessageBird", domain: "messagebird.com", category: "Communication", description: "Send SMS, voice, and omnichannel messages through MessageBird.", capabilities: ["send_sms", "send_whatsapp", "list_messages", "lookup_number"], auth_type: "api_key", apiKeyUrl: "https://dashboard.messagebird.com/developers/access" },
  { slug: "plivo", name: "Plivo", domain: "plivo.com", category: "Communication", description: "Send SMS and voice calls through Plivo.", capabilities: ["send_sms", "create_call", "list_messages", "lookup_number"], auth_type: "api_key", apiKeyUrl: "https://console.plivo.com/dashboard/" },
  { slug: "vonage", name: "Vonage", domain: "vonage.com", category: "Communication", description: "Send SMS, voice, verification, and messaging workflows through Vonage.", capabilities: ["send_sms", "create_call", "verify_user", "list_messages"], auth_type: "api_key", apiKeyUrl: "https://dashboard.nexmo.com/settings" },
  { slug: "gmail", name: "Gmail", domain: "gmail.com", category: "Communication", description: "Read, send, and manage Gmail emails.", capabilities: ["send_email", "list_emails", "search_emails", "create_draft", "add_label"], auth_type: "oauth2" },
  { slug: "outlook", name: "Outlook", domain: "outlook.com", category: "Communication", description: "Read, send, and manage Outlook emails and calendar.", capabilities: ["send_email", "list_emails", "create_event", "search_emails"], auth_type: "oauth2" },

  // ── Project Management ─────────────────────────────────────────────────────
  { slug: "linear", name: "Linear", domain: "linear.app", category: "Project Management", description: "Create and track issues, projects, and cycles.", capabilities: ["create_issue", "update_issue", "list_issues", "search_issues", "create_project"], auth_type: "api_key" },
  { slug: "jira", name: "Jira", domain: "atlassian.com", category: "Project Management", description: "Manage Jira tickets, sprints, and boards.", capabilities: ["create_issue", "update_issue", "list_issues", "search_issues", "create_sprint"], auth_type: "oauth2" },
  { slug: "trello", name: "Trello", domain: "trello.com", category: "Project Management", description: "Create cards, move through lists, and manage boards.", capabilities: ["create_card", "move_card", "list_boards", "add_comment", "create_checklist"], auth_type: "api_key" },
  { slug: "asana", name: "Asana", domain: "asana.com", category: "Project Management", description: "Manage tasks, projects, and team workloads.", capabilities: ["create_task", "update_task", "list_projects", "assign_task", "add_comment"], auth_type: "oauth2" },
  { slug: "clickup", name: "ClickUp", domain: "clickup.com", category: "Project Management", description: "All-in-one project management and productivity platform.", capabilities: ["create_task", "update_task", "list_spaces", "create_doc", "track_time"], auth_type: "api_key" },
  { slug: "monday", name: "Monday.com", domain: "monday.com", category: "Project Management", description: "Manage boards, items, and workflows in Monday.com.", capabilities: ["create_item", "update_item", "list_boards", "create_column", "add_update"], auth_type: "api_key" },
  { slug: "basecamp", name: "Basecamp", domain: "basecamp.com", category: "Project Management", description: "Create to-dos, schedule events, and manage projects in Basecamp.", capabilities: ["create_todo", "list_projects", "post_message", "create_event"], auth_type: "oauth2" },
  { slug: "height", name: "Height", domain: "height.app", category: "Project Management", description: "Create and manage tasks in Height workspaces.", capabilities: ["create_task", "update_task", "list_lists", "add_comment"], auth_type: "api_key" },

  // ── Productivity ───────────────────────────────────────────────────────────
  { slug: "notion", name: "Notion", domain: "notion.so", category: "Productivity", description: "Create pages, databases, and manage your knowledge base.", capabilities: ["create_page", "update_page", "search_pages", "list_databases", "query_database"], auth_type: "api_key" },
  { slug: "todoist", name: "Todoist", domain: "todoist.com", category: "Productivity", description: "Add and manage tasks with priorities and due dates.", capabilities: ["create_task", "complete_task", "list_tasks", "create_project", "add_comment"], auth_type: "oauth2" },
  { slug: "google-calendar", name: "Google Calendar", domain: "calendar.google.com", category: "Productivity", description: "Create events, check availability, and manage schedules.", capabilities: ["create_event", "list_events", "check_availability", "delete_event", "invite_attendee"], auth_type: "oauth2" },
  { slug: "microsoft-graph", name: "Microsoft Graph", domain: "developer.microsoft.com", category: "Productivity", description: "Access Microsoft 365 mail, calendar, files, users, and collaboration data through Microsoft Graph.", capabilities: ["send_email", "create_event", "list_files", "list_users", "read_directory"], auth_type: "oauth2", apiKeyUrl: "https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
  { slug: "google-workspace-api", name: "Google Workspace API", domain: "developers.google.com", category: "Productivity", description: "Connect Gmail, Calendar, Drive, Docs, Sheets, and Admin APIs through Google Workspace.", capabilities: ["send_email", "create_event", "list_files", "update_sheet", "manage_users"], auth_type: "oauth2", apiKeyUrl: "https://console.cloud.google.com/apis/credentials" },
  { slug: "microsoft-todo", name: "Microsoft To Do", domain: "todo.microsoft.com", category: "Productivity", description: "Manage tasks and to-do lists across Microsoft 365.", capabilities: ["create_task", "complete_task", "list_lists", "create_list"], auth_type: "oauth2" },
  { slug: "obsidian", name: "Obsidian", domain: "obsidian.md", category: "Productivity", description: "Create and manage notes and knowledge graphs in Obsidian.", capabilities: ["create_note", "read_note", "search_notes", "create_link"], auth_type: "api_key" },
  { slug: "roam", name: "Roam Research", domain: "roamresearch.com", category: "Productivity", description: "Add blocks and pages to your Roam Research graph.", capabilities: ["create_block", "create_page", "search_graph"], auth_type: "api_key" },
  { slug: "evernote", name: "Evernote", domain: "evernote.com", category: "Productivity", description: "Create and manage notes and notebooks in Evernote.", capabilities: ["create_note", "list_notebooks", "search_notes", "add_tag"], auth_type: "oauth2" },
  { slug: "bear", name: "Bear", domain: "bear.app", category: "Productivity", description: "Create and manage notes in Bear for Mac and iOS.", capabilities: ["create_note", "search_notes", "add_tag"], auth_type: "api_key" },
  { slug: "apple-reminders", name: "Apple Reminders", domain: "apple.com", category: "Productivity", description: "Add reminders to Apple Reminders lists.", capabilities: ["create_reminder", "list_reminders", "complete_reminder"], auth_type: "none" },

  // ── Storage ────────────────────────────────────────────────────────────────
  { slug: "google-drive", name: "Google Drive", domain: "drive.google.com", category: "Storage", description: "Search, read, and manage files in Google Drive.", capabilities: ["list_files", "read_file", "create_file", "share_file", "move_file"], auth_type: "oauth2" },
  { slug: "dropbox", name: "Dropbox", domain: "dropbox.com", category: "Storage", description: "Access and manage files in your Dropbox account.", capabilities: ["list_files", "upload_file", "download_file", "share_file", "delete_file"], auth_type: "oauth2" },
  { slug: "onedrive", name: "OneDrive", domain: "onedrive.live.com", category: "Storage", description: "Browse and manage Microsoft OneDrive files.", capabilities: ["list_files", "upload_file", "download_file", "share_file"], auth_type: "oauth2" },
  { slug: "box", name: "Box", domain: "box.com", category: "Storage", description: "Manage files and folders in Box cloud storage.", capabilities: ["list_files", "upload_file", "share_file", "create_folder"], auth_type: "oauth2" },
  { slug: "s3", name: "AWS S3", domain: "aws.amazon.com", category: "Storage", description: "Read and write objects in Amazon S3 buckets.", capabilities: ["list_objects", "get_object", "put_object", "delete_object", "create_bucket"], auth_type: "api_key" },

  // ── Design ─────────────────────────────────────────────────────────────────
  { slug: "figma", name: "Figma", domain: "figma.com", category: "Design", description: "Access design files, components, and comments.", capabilities: ["list_files", "get_file", "get_comments", "post_comment", "export_asset"], auth_type: "api_key" },
  { slug: "miro", name: "Miro", domain: "miro.com", category: "Design", description: "Create and update boards, sticky notes, and diagrams.", capabilities: ["create_board", "list_boards", "create_sticky", "create_shape", "export_board"], auth_type: "oauth2" },
  { slug: "canva", name: "Canva", domain: "canva.com", category: "Design", description: "Create and export designs using Canva's design library.", capabilities: ["create_design", "list_designs", "export_design", "use_template"], auth_type: "oauth2" },
  { slug: "adobe-xd", name: "Adobe XD", domain: "adobe.com", category: "Design", description: "Access Adobe XD prototypes and assets.", capabilities: ["list_files", "get_prototype", "get_assets"], auth_type: "oauth2" },
  { slug: "sketch", name: "Sketch", domain: "sketch.com", category: "Design", description: "Access Sketch documents and artboards.", capabilities: ["list_documents", "get_artboard", "export_asset"], auth_type: "api_key" },

  // ── Dev & Data ─────────────────────────────────────────────────────────────
  { slug: "github", name: "GitHub", domain: "github.com", category: "Dev & Data", description: "Create issues, review PRs, query repos, and automate blog posts, READMEs, and PR descriptions directly in your repo.", capabilities: ["create_issue", "list_prs", "get_repo", "create_pr", "merge_pr", "add_comment", "create_file", "update_file", "search_code"], auth_type: "api_key", mcpDocsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/github" },
  { slug: "gitlab", name: "GitLab", domain: "gitlab.com", category: "Dev & Data", description: "Manage GitLab projects, issues, and merge requests.", capabilities: ["create_issue", "list_mrs", "get_project", "create_mr", "run_pipeline"], auth_type: "api_key" },
  { slug: "supabase", name: "Supabase", domain: "supabase.com", category: "Dev & Data", description: "Query your Supabase database and manage projects.", capabilities: ["run_query", "list_tables", "insert_row", "update_row", "delete_row"], auth_type: "api_key" },
  { slug: "snowflake", name: "Snowflake", domain: "snowflake.com", category: "Dev & Data", description: "Run SQL queries against your Snowflake data warehouse.", capabilities: ["run_query", "list_tables", "list_schemas", "create_table"], auth_type: "api_key" },
  { slug: "postgres", name: "PostgreSQL", domain: "postgresql.org", category: "Dev & Data", description: "Run SQL queries against a PostgreSQL database.", capabilities: ["run_query", "list_tables", "describe_table", "insert_row"], auth_type: "api_key" },
  { slug: "mysql", name: "MySQL", domain: "mysql.com", category: "Dev & Data", description: "Run SQL queries against a MySQL database.", capabilities: ["run_query", "list_tables", "describe_table", "insert_row"], auth_type: "api_key" },
  { slug: "bigquery", name: "Google BigQuery", domain: "cloud.google.com", category: "Dev & Data", description: "Run analytical queries on Google BigQuery datasets.", capabilities: ["run_query", "list_datasets", "list_tables", "create_table"], auth_type: "oauth2" },
  { slug: "vercel", name: "Vercel", domain: "vercel.com", category: "Dev & Data", description: "Manage Vercel deployments, domains, and projects.", capabilities: ["list_deployments", "create_deployment", "list_domains", "get_logs"], auth_type: "api_key" },
  { slug: "netlify", name: "Netlify", domain: "netlify.com", category: "Dev & Data", description: "Deploy sites and manage Netlify functions.", capabilities: ["list_sites", "trigger_deploy", "list_functions", "get_deploy_log"], auth_type: "api_key" },
  { slug: "render", name: "Render", domain: "render.com", category: "Dev & Data", description: "Deploy services and manage infrastructure on Render.", capabilities: ["list_services", "deploy_service", "get_logs", "create_service"], auth_type: "api_key" },
  { slug: "sentry", name: "Sentry", domain: "sentry.io", category: "Dev & Data", description: "Query errors, issues, and performance data from Sentry.", capabilities: ["list_issues", "get_issue", "resolve_issue", "list_projects"], auth_type: "api_key" },
  { slug: "datadog", name: "Datadog", domain: "datadoghq.com", category: "Dev & Data", description: "Query metrics, logs, and monitors in Datadog.", capabilities: ["query_metrics", "list_monitors", "get_logs", "create_event"], auth_type: "api_key" },
  { slug: "pagerduty", name: "PagerDuty", domain: "pagerduty.com", category: "Dev & Data", description: "Manage PagerDuty incidents and on-call schedules.", capabilities: ["list_incidents", "create_incident", "resolve_incident", "get_schedule"], auth_type: "api_key" },

  // ── Automation ─────────────────────────────────────────────────────────────
  { slug: "zapier", name: "Zapier", domain: "zapier.com", category: "Automation", description: "Trigger Zaps and automate workflows across apps.", capabilities: ["trigger_zap", "list_zaps", "run_workflow"], auth_type: "api_key", apiKeyUrl: "https://developer.zapier.com/" },
  { slug: "make", name: "Make (Integromat)", domain: "make.com", category: "Automation", description: "Run Make scenarios and automation workflows.", capabilities: ["run_scenario", "list_scenarios", "get_execution_log"], auth_type: "api_key", apiKeyUrl: "https://www.make.com/en/api-documentation/authentication-token" },
  { slug: "n8n", name: "n8n", domain: "n8n.io", category: "Automation", description: "Trigger n8n workflows and manage executions.", capabilities: ["run_workflow", "list_workflows", "get_execution"], auth_type: "api_key" },
  { slug: "pipedream", name: "Pipedream", domain: "pipedream.com", category: "Automation", description: "Trigger Pipedream workflows and manage connected apps.", capabilities: ["trigger_workflow", "list_workflows", "get_execution"], auth_type: "api_key", apiKeyUrl: "https://pipedream.com/settings/account" },

  // ── CRM & Finance ──────────────────────────────────────────────────────────
  { slug: "hubspot", name: "HubSpot", domain: "hubspot.com", category: "CRM & Finance", description: "Manage contacts, deals, and marketing campaigns.", capabilities: ["create_contact", "update_contact", "list_deals", "create_deal", "send_email", "log_activity"], auth_type: "api_key" },
  { slug: "salesforce", name: "Salesforce", domain: "salesforce.com", category: "CRM & Finance", description: "Manage Salesforce leads, opportunities, and accounts.", capabilities: ["create_lead", "update_opportunity", "list_accounts", "run_soql", "create_task"], auth_type: "oauth2" },
  { slug: "pipedrive", name: "Pipedrive", domain: "pipedrive.com", category: "CRM & Finance", description: "Manage deals, contacts, and pipeline stages in Pipedrive.", capabilities: ["create_deal", "update_deal", "list_persons", "create_activity"], auth_type: "api_key" },
  { slug: "attio", name: "Attio", domain: "attio.com", category: "CRM & Finance", description: "Manage contacts, companies, and records in Attio CRM.", capabilities: ["list_records", "create_record", "update_record", "search_records"], auth_type: "api_key" },
  { slug: "clearbit", name: "Clearbit", domain: "clearbit.com", category: "CRM & Finance", description: "Enrich companies, contacts, and domains with Clearbit data.", capabilities: ["enrich_person", "enrich_company", "lookup_domain", "prospect_contacts"], auth_type: "api_key", apiKeyUrl: "https://dashboard.clearbit.com/api" },
  { slug: "quickbooks", name: "QuickBooks", domain: "quickbooks.intuit.com", category: "CRM & Finance", description: "Read and manage invoices, expenses, and accounting data.", capabilities: ["list_invoices", "create_invoice", "list_expenses", "get_balance_sheet"], auth_type: "oauth2" },
  { slug: "xero", name: "Xero", domain: "xero.com", category: "CRM & Finance", description: "Manage accounting, invoices, and expenses in Xero.", capabilities: ["list_invoices", "create_invoice", "list_contacts", "get_reports"], auth_type: "oauth2" },
  { slug: "freshdesk", name: "Freshdesk", domain: "freshdesk.com", category: "CRM & Finance", description: "Manage customer support tickets and agents in Freshdesk.", capabilities: ["create_ticket", "list_tickets", "reply_ticket", "assign_agent"], auth_type: "api_key" },
  { slug: "zendesk", name: "Zendesk", domain: "zendesk.com", category: "CRM & Finance", description: "Manage support tickets, users, and organizations in Zendesk.", capabilities: ["create_ticket", "list_tickets", "update_ticket", "list_users"], auth_type: "api_key" },
  { slug: "intercom", name: "Intercom", domain: "intercom.com", category: "CRM & Finance", description: "Manage customer support conversations and contacts.", capabilities: ["list_conversations", "reply_conversation", "create_contact", "tag_user"], auth_type: "api_key" },

  // ── Finance ────────────────────────────────────────────────────────────────
  { slug: "plaid", name: "Plaid", domain: "plaid.com", category: "Finance", description: "Connect bank accounts and retrieve financial data via Plaid.", capabilities: ["get_transactions", "get_balance", "get_identity", "get_accounts"], auth_type: "api_key", apiKeyUrl: "https://dashboard.plaid.com/developers/keys" },
  { slug: "salt-edge", name: "Salt Edge", domain: "saltedge.com", category: "Finance", description: "Connect global bank accounts and aggregate transaction data via Salt Edge.", capabilities: ["get_transactions", "get_balance", "get_accounts", "get_connections"], auth_type: "api_key" },
  { slug: "alpha-vantage", name: "Alpha Vantage", domain: "alphavantage.co", category: "Finance", description: "Get stock prices, financial data, and market indicators.", capabilities: ["get_stock_price", "get_time_series", "get_forex_rate", "get_crypto_price"], auth_type: "api_key", apiKeyUrl: "https://www.alphavantage.co/support/#api-key" },
  { slug: "coinbase", name: "Coinbase", domain: "coinbase.com", category: "Finance", description: "Manage crypto portfolios and get market data via Coinbase.", capabilities: ["get_portfolio", "get_price", "list_transactions", "get_account"], auth_type: "oauth2" },
  { slug: "binance", name: "Binance", domain: "binance.com", category: "Finance", description: "Get crypto prices and account data from Binance.", capabilities: ["get_price", "get_account", "list_orders", "get_ticker"], auth_type: "api_key" },
  { slug: "open-exchange-rates", name: "Open Exchange Rates", domain: "openexchangerates.org", category: "Finance", description: "Get live and historical foreign exchange rates.", capabilities: ["get_latest_rates", "convert_currency", "get_historical_rates"], auth_type: "api_key" },

  // ── Health & Wellness ──────────────────────────────────────────────────────
  { slug: "fitbit", name: "Fitbit", domain: "fitbit.com", category: "Health & Wellness", description: "Retrieve activity, sleep, and health metrics from Fitbit.", capabilities: ["get_activity", "get_sleep", "get_heart_rate", "log_activity"], auth_type: "oauth2" },
  { slug: "garmin", name: "Garmin Connect", domain: "connect.garmin.com", category: "Health & Wellness", description: "Retrieve workout and health metrics from Garmin devices.", capabilities: ["get_activities", "get_heart_rate", "get_sleep", "get_steps"], auth_type: "oauth2" },
  { slug: "apple-health", name: "Apple Health", domain: "apple.com", category: "Health & Wellness", description: "Read health and activity data from Apple Health.", capabilities: ["get_steps", "get_heart_rate", "get_sleep", "get_workouts"], auth_type: "none" },
  { slug: "whoop", name: "WHOOP", domain: "whoop.com", category: "Health & Wellness", description: "Get recovery, strain, and sleep data from WHOOP.", capabilities: ["get_recovery", "get_strain", "get_sleep", "get_workouts"], auth_type: "oauth2" },
  { slug: "oura", name: "Oura Ring", domain: "ouraring.com", category: "Health & Wellness", description: "Get readiness, sleep, and activity data from Oura Ring.", capabilities: ["get_readiness", "get_sleep", "get_activity", "get_heart_rate"], auth_type: "api_key" },
  { slug: "cronometer", name: "Cronometer", domain: "cronometer.com", category: "Health & Wellness", description: "Log food intake and track nutritional data.", capabilities: ["log_food", "get_nutrients", "get_diary"], auth_type: "api_key" },
  { slug: "myfitnesspal", name: "MyFitnessPal", domain: "myfitnesspal.com", category: "Health & Wellness", description: "Log meals and get calorie and nutrition data.", capabilities: ["log_food", "get_diary", "search_foods", "get_nutrients"], auth_type: "oauth2" },

  // ── Analytics ──────────────────────────────────────────────────────────────
  { slug: "google-analytics", name: "Google Analytics", domain: "analytics.google.com", category: "Analytics", description: "Query traffic, conversions, and user behavior metrics.", capabilities: ["get_report", "list_properties", "get_realtime", "get_audience"], auth_type: "oauth2" },
  { slug: "mixpanel", name: "Mixpanel", domain: "mixpanel.com", category: "Analytics", description: "Query Mixpanel events, funnels, and retention data.", capabilities: ["query_events", "get_funnel", "get_retention", "get_user_profile"], auth_type: "api_key" },
  { slug: "amplitude", name: "Amplitude", domain: "amplitude.com", category: "Analytics", description: "Query user behavior and event analytics from Amplitude.", capabilities: ["get_chart", "query_events", "get_cohort", "get_funnel"], auth_type: "api_key" },
  { slug: "posthog", name: "PostHog", domain: "posthog.com", category: "Analytics", description: "Query events, flags, and session recordings in PostHog.", capabilities: ["query_events", "get_feature_flags", "list_recordings", "get_funnel"], auth_type: "api_key" },
  { slug: "hotjar", name: "Hotjar", domain: "hotjar.com", category: "Analytics", description: "Get heatmaps, session recordings, and survey data.", capabilities: ["get_heatmaps", "list_recordings", "get_surveys"], auth_type: "api_key" },
  { slug: "segment", name: "Twilio Segment", domain: "segment.com", category: "Analytics", description: "Query events and manage customer data pipelines in Twilio Segment.", capabilities: ["list_sources", "get_events", "manage_destinations"], auth_type: "api_key", apiKeyUrl: "https://app.segment.com/" },

  // Payments
  { slug: "stripe", name: "Stripe", domain: "stripe.com", category: "Payments", description: "Query payments, subscriptions, invoices, and customer data.", capabilities: ["list_payments", "get_customer", "create_subscription", "list_invoices", "refund_payment"], auth_type: "api_key", apiKeyUrl: "https://dashboard.stripe.com/apikeys" },
  { slug: "paypal", name: "PayPal", domain: "paypal.com", category: "Payments", description: "Create and reconcile PayPal orders, payments, and subscriptions.", capabilities: ["create_order", "capture_payment", "list_transactions", "refund_payment"], auth_type: "oauth2", apiKeyUrl: "https://developer.paypal.com/dashboard/applications/live" },
  { slug: "square", name: "Square", domain: "squareup.com", category: "Payments", description: "Manage Square payments, customers, catalog items, and orders.", capabilities: ["create_payment", "list_orders", "get_customer", "manage_catalog"], auth_type: "oauth2", apiKeyUrl: "https://developer.squareup.com/apps" },
  { slug: "razorpay", name: "Razorpay", domain: "razorpay.com", category: "Payments", description: "Create and reconcile Razorpay payments, orders, refunds, and subscriptions.", capabilities: ["create_order", "capture_payment", "list_payments", "refund_payment"], auth_type: "api_key", apiKeyUrl: "https://dashboard.razorpay.com/app/keys" },

  // Maps & Weather
  { slug: "google-maps", name: "Google Maps", domain: "mapsplatform.google.com", category: "Maps & Weather", description: "Geocode addresses, plan routes, and search places through Google Maps Platform.", capabilities: ["geocode_address", "search_places", "get_directions", "distance_matrix"], auth_type: "api_key", apiKeyUrl: "https://console.cloud.google.com/google/maps-apis/credentials" },
  { slug: "openweathermap", name: "OpenWeatherMap", domain: "openweathermap.org", category: "Maps & Weather", description: "Fetch current weather, forecasts, and historical weather data.", capabilities: ["current_weather", "weather_forecast", "historical_weather", "air_pollution"], auth_type: "api_key", apiKeyUrl: "https://home.openweathermap.org/api_keys" },

  // Travel
  { slug: "skyscanner", name: "Skyscanner", domain: "skyscanner.net", category: "Travel", description: "Search flight, hotel, and travel pricing data through Skyscanner APIs.", capabilities: ["search_flights", "get_quote", "search_hotels", "compare_routes"], auth_type: "api_key", apiKeyUrl: "https://developers.skyscanner.net/" },
  { slug: "amadeus", name: "Amadeus", domain: "amadeus.com", category: "Travel", description: "Search flights, hotels, airport data, and travel offers through Amadeus for Developers.", capabilities: ["search_flights", "search_hotels", "airport_lookup", "price_offer"], auth_type: "api_key", apiKeyUrl: "https://developers.amadeus.com/my-apps" },

  // ── AI & Research ──────────────────────────────────────────────────────────
  { slug: "openai", name: "OpenAI", domain: "openai.com", category: "AI & Research", description: "Run completions, embeddings, and image generation via OpenAI.", capabilities: ["chat_completion", "create_embedding", "generate_image", "transcribe_audio"], auth_type: "api_key" },
  { slug: "anthropic", name: "Anthropic Claude", domain: "anthropic.com", category: "AI & Research", description: "Run Claude models for completions and analysis.", capabilities: ["chat_completion", "create_embedding", "analyze_document"], auth_type: "api_key" },
  { slug: "mistral-ai", name: "Mistral AI", domain: "mistral.ai", category: "AI & Research", description: "Run Mistral chat, reasoning, and embedding models.", capabilities: ["chat_completion", "create_embedding", "analyze_document"], auth_type: "api_key", apiKeyUrl: "https://console.mistral.ai/api-keys" },
  { slug: "hugging-face", name: "Hugging Face", domain: "huggingface.co", category: "AI & Research", description: "Run Hugging Face inference endpoints and model APIs.", capabilities: ["chat_completion", "text_generation", "create_embedding", "model_inference"], auth_type: "api_key", apiKeyUrl: "https://huggingface.co/settings/tokens" },
  { slug: "perplexity", name: "Perplexity", domain: "perplexity.ai", category: "AI & Research", description: "Run web-grounded searches and research queries.", capabilities: ["search", "ask_question", "get_sources"], auth_type: "api_key" },
  { slug: "serper", name: "Serper", domain: "serper.dev", category: "AI & Research", description: "Run Google search queries via the Serper API.", capabilities: ["search_web", "search_images", "search_news"], auth_type: "api_key" },
  {
    slug: "firecrawl",
    name: "Firecrawl",
    domain: "firecrawl.dev",
    category: "AI & Research",
    description: "Crawl, scrape, and extract structured web content for research and agent workflows.",
    capabilities: ["crawl_site", "scrape_page", "extract_structured_data", "search_site"],
    auth_type: "api_key",
    apiKeyUrl: "https://newsapi.org/register",
    billing: {
      provider_key: "firecrawl",
      provider_category: "web_scraping",
      billing_category: "web_scraping",
      billing_model: "hybrid",
      pricing_summary: "Paid plans currently range from about $16/month to $599/month, with usage measured in credits.",
      free_tier_summary: "Free tier currently includes about 1,000 credits per month.",
      pricing_source_url: "https://costbench.com/software/web-scraping/firecrawl/",
      default_usage_unit: "credits",
      default_quantity_per_call: 1,
    },
  },
  {
    slug: "bright-data",
    name: "Bright Data",
    domain: "brightdata.com",
    category: "AI & Research",
    description: "Proxy, scraping, and dataset access for web extraction at higher volume and harder targets.",
    capabilities: ["scrape_page", "crawl_site", "proxy_fetch", "extract_dataset"],
    auth_type: "api_key",
    billing: {
      provider_key: "bright-data",
      provider_category: "web_scraping",
      billing_category: "web_scraping",
      billing_model: "hybrid",
      pricing_summary: "Pricing varies by product, from roughly $0.90 per IP for datacenter proxies to API-style usage tiers and higher-volume enterprise plans.",
      free_tier_summary: "Product-specific trials and starting tiers vary by proxy and API product.",
      pricing_source_url: "https://costbench.com/software/web-scraping/bright-data/",
      default_usage_unit: "requests",
      default_quantity_per_call: 1,
    },
  },
  {
    slug: "newsapi-org",
    name: "NewsAPI.org",
    domain: "newsapi.org",
    category: "AI & Research",
    description: "Search headlines and articles from a simple news API, mainly suitable for development and testing on the free tier.",
    capabilities: ["search_news", "top_headlines", "source_lookup"],
    auth_type: "api_key",
    billing: {
      provider_key: "newsapi-org",
      provider_category: "news_api",
      billing_category: "news_api",
      billing_model: "free_dev_only",
      pricing_summary: "Free tier allows about 100 requests per day; production/commercial access starts at a much higher paid plan.",
      free_tier_summary: "Free tier is development-only and not intended for production use.",
      production_caveat: "NewsAPI.org free access is not licensed for production use; users need a paid production plan before relying on it in live workflows.",
      pricing_source_url: "https://thunderbit.com/blog/best-news-apis-compared",
      default_usage_unit: "requests",
      default_quantity_per_call: 1,
    },
  },
  {
    slug: "newsapi-ai",
    name: "NewsAPI.ai",
    domain: "newsapi.ai",
    category: "AI & Research",
    description: "Search and monitor news coverage with richer analytics and production-usable free and paid tiers.",
    capabilities: ["search_news", "monitor_topics", "entity_news_search", "source_lookup"],
    auth_type: "api_key",
    billing: {
      provider_key: "newsapi-ai",
      provider_category: "news_api",
      billing_category: "news_api",
      billing_model: "hybrid",
      pricing_summary: "Paid access currently starts around $90/month, with token-based usage above included limits.",
      free_tier_summary: "Free tier currently includes about 2,000 searches and is usable in production.",
      pricing_source_url: "https://thunderbit.com/blog/best-news-apis-compared",
      default_usage_unit: "searches",
      default_quantity_per_call: 1,
    },
  },
  {
    slug: "exa",
    name: "Exa",
    domain: "exa.ai",
    category: "AI & Research",
    description: "AI-native search and content retrieval for research, source discovery, and web-grounded agent answers.",
    capabilities: ["search_web", "answer_question", "get_contents", "monitor_topics"],
    auth_type: "api_key",
    billing: {
      provider_key: "exa",
      provider_category: "search_api",
      billing_category: "search_api",
      billing_model: "usage",
      pricing_summary: "Usage is charged by endpoint, with search around $7/1K requests, answers around $5/1K, and deeper search modes priced higher.",
      free_tier_summary: "Signup credits plus recurring monthly free credits are currently available.",
      pricing_source_url: "https://fastcrw.com/blog/exa-pricing-explained",
      default_usage_unit: "requests",
      default_quantity_per_call: 1,
      capability_metering: {
        search_web: { usage_unit: "requests", quantity: 1, estimated_cost_usd: 0.007 },
        answer_question: { usage_unit: "requests", quantity: 1, estimated_cost_usd: 0.005 },
      },
    },
  },
  {
    slug: "tavily",
    name: "Tavily",
    domain: "tavily.com",
    category: "AI & Research",
    description: "Search API tuned for LLM agents, grounding, and research workflows with credit-based billing.",
    capabilities: ["search_web", "extract_results", "search_news", "ground_query"],
    auth_type: "api_key",
    billing: {
      provider_key: "tavily",
      provider_category: "search_api",
      billing_category: "search_api",
      billing_model: "hybrid",
      pricing_summary: "Plans currently start around $30/month for 4,000 credits, with pay-as-you-go pricing around $0.008 per credit.",
      free_tier_summary: "Free tier currently includes about 1,000 credits.",
      pricing_source_url: "https://coldiq.com/blog/tavily-pricing",
      default_usage_unit: "credits",
      default_quantity_per_call: 1,
      estimated_cost_usd_per_call: 0.008,
    },
  },
  {
    slug: "brave-search-api",
    name: "Brave Search API",
    domain: "brave.com",
    category: "AI & Research",
    description: "Independent web search API for live search, grounding, and retrieval without relying on a single LLM vendor.",
    capabilities: ["search_web", "search_news", "search_images"],
    auth_type: "api_key",
    billing: {
      provider_key: "brave-search-api",
      provider_category: "search_api",
      billing_category: "search_api",
      billing_model: "usage",
      pricing_summary: "Current usage pricing is roughly in the low single-digit dollars per 1,000 queries, with free access for lighter usage.",
      free_tier_summary: "Free tier is available for low-volume usage.",
      pricing_source_url: "https://costbench.com/software/ai-search-apis/brave-search-api/",
      default_usage_unit: "queries",
      default_quantity_per_call: 1,
    },
  },
  { slug: "arxiv", name: "arXiv", domain: "arxiv.org", category: "AI & Research", description: "Search and retrieve academic papers from arXiv.", capabilities: ["search_papers", "get_paper", "list_categories"], auth_type: "none" },
  { slug: "wikipedia", name: "Wikipedia", domain: "wikipedia.org", category: "AI & Research", description: "Search and retrieve Wikipedia articles.", capabilities: ["search_articles", "get_article", "get_summary"], auth_type: "none" },
  { slug: "wolfram-alpha", name: "Wolfram Alpha", domain: "wolframalpha.com", category: "AI & Research", description: "Compute answers to factual and mathematical queries.", capabilities: ["compute_query", "get_facts", "solve_math"], auth_type: "api_key" },
  { slug: "mcp-fetch", name: "Fetch (MCP)", domain: "modelcontextprotocol.io", category: "AI & Research", description: "Gather raw research data from any URL and convert it to LLM-ready Markdown. Best for web research, documentation ingestion, and content extraction.", capabilities: ["fetch_url", "fetch_markdown", "fetch_raw", "extract_links"], auth_type: "none", mcpDocsUrl: "https://github.com/modelcontextprotocol/servers/tree/main/src/fetch" },
  { slug: "omnyid-python-tools", name: "Python Tools (local)", domain: "127.0.0.1", category: "AI & Research", description: "Local MCP server for image resizing/filtering/conversion, video thumbnail extraction, PDF text extraction, and CSV processing. Start with: uvicorn mcp-servers/python-tools/server:app --port 18765", capabilities: ["image_resize", "image_thumbnail", "image_convert", "image_filter", "video_thumbnail", "video_trim", "pdf_extract_text", "pdf_extract_pages"], auth_type: "none" },
  { slug: "elevenlabs", name: "ElevenLabs", domain: "elevenlabs.io", category: "AI & Research", description: "Generate high-quality audio voiceovers and speech from text using ElevenLabs AI voices.", capabilities: ["text_to_speech", "list_voices", "clone_voice", "generate_audio", "get_history"], auth_type: "api_key", mcpDocsUrl: "https://github.com/mamertofabian/mcp-elevenlabs" },

  // ── E-commerce ─────────────────────────────────────────────────────────────
  { slug: "shopify", name: "Shopify", domain: "shopify.com", category: "E-commerce", description: "Manage Shopify products, orders, and customers.", capabilities: ["list_products", "create_product", "list_orders", "update_order", "get_customer"], auth_type: "api_key", apiKeyUrl: "https://admin.shopify.com/store/" },
  { slug: "woocommerce", name: "WooCommerce", domain: "woocommerce.com", category: "E-commerce", description: "Manage WooCommerce products, orders, and inventory.", capabilities: ["list_products", "create_product", "list_orders", "update_inventory"], auth_type: "api_key" },
  { slug: "ebay", name: "eBay", domain: "ebay.com", category: "E-commerce", description: "Search listings and manage eBay seller accounts.", capabilities: ["search_listings", "get_item", "list_orders", "update_listing"], auth_type: "oauth2" },
  { slug: "amazon-mws", name: "Amazon SP API", domain: "amazon.com", category: "E-commerce", description: "Manage Amazon Seller Central listings and orders.", capabilities: ["list_orders", "get_inventory", "create_listing", "get_report"], auth_type: "api_key" },
  { slug: "etsy", name: "Etsy", domain: "etsy.com", category: "E-commerce", description: "Manage Etsy shop listings and orders.", capabilities: ["list_listings", "create_listing", "list_orders", "update_listing"], auth_type: "oauth2" },
  { slug: "printful", name: "Printful", domain: "printful.com", category: "E-commerce", description: "Manage Printful print-on-demand products and orders.", capabilities: ["list_products", "create_product", "list_orders", "get_shipping_rates"], auth_type: "api_key" },

  // ── Education ──────────────────────────────────────────────────────────────
  { slug: "google-classroom", name: "Google Classroom", domain: "classroom.google.com", category: "Education", description: "Manage courses, assignments, and students in Google Classroom.", capabilities: ["list_courses", "create_assignment", "list_students", "get_submissions"], auth_type: "oauth2" },
  { slug: "canvas-lms", name: "Canvas LMS", domain: "instructure.com", category: "Education", description: "Manage Canvas courses, assignments, and grades.", capabilities: ["list_courses", "create_assignment", "get_grades", "list_students"], auth_type: "api_key" },
  { slug: "blackboard-lms", name: "Blackboard", domain: "blackboard.com", category: "Education", description: "Import Blackboard courses, content, assessments, and due dates.", capabilities: ["list_courses", "list_content", "list_assignments", "list_tests"], auth_type: "oauth2" },
  { slug: "duolingo", name: "Duolingo", domain: "duolingo.com", category: "Education", description: "Retrieve Duolingo progress and streak data.", capabilities: ["get_profile", "get_courses", "get_streak"], auth_type: "api_key" },
  { slug: "khan-academy", name: "Khan Academy", domain: "khanacademy.org", category: "Education", description: "Access Khan Academy exercises and progress data.", capabilities: ["get_progress", "list_exercises", "get_video"], auth_type: "oauth2" },
];
