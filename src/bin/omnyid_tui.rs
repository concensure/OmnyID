// @locs-version: 1.0
// @module-id: bin.omnyid-tui
// @primary-capability: terminal-operations-ui
// @stability: experimental

//! omnyid_tui — minimal developer dashboard for the OmnyID homeserver.
//!
//! Usage:
//!   cargo run --bin omnyid_tui --features tui
//!
//! Environment variables:
//!   OMNYID_BASE_URL   Base URL of the running server (default: http://localhost:8080)
//!   OMNYID_TUI_TOKEN  Bearer token — enables the live AFP event log via WebSocket
//!
//! Keys:
//!   q / Ctrl-C   quit
//!   r            force refresh now

#![cfg(feature = "tui")]

use std::{
    collections::VecDeque,
    io,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use crossterm::{
    event::{self, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use ratatui::{
    Frame, Terminal,
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Cell, Paragraph, Row, Table, Wrap},
};

// ── Shared state ──────────────────────────────────────────────────────────────

#[derive(Default, Clone)]
struct TuiState {
    health: String,
    db_ready: String,
    relay_connections: u64,
    relay_sends: u64,
    relay_errors: u64,
    relay_thread_subs: u64,
    relay_webtransport_sessions: u64,
    last_refresh: Option<Instant>,
    last_error: Option<String>,
    event_log: VecDeque<(String, String)>, // (timestamp, message)
}

impl TuiState {
    fn push_event(&mut self, msg: impl Into<String>) {
        let ts = chrono_now();
        self.event_log.push_front((ts, msg.into()));
        if self.event_log.len() > 200 {
            self.event_log.pop_back();
        }
    }
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let h = (secs % 86400) / 3600;
    let m = (secs % 3600) / 60;
    let s = secs % 60;
    format!("{h:02}:{m:02}:{s:02}")
}

// ── HTTP polling ──────────────────────────────────────────────────────────────

fn fetch_json(url: &str) -> Option<serde_json::Value> {
    // reqwest blocking is not in the dep tree — use std::net via a raw HTTP/1.1 GET.
    // This keeps the binary dependency-light and avoids feature-gating reqwest::blocking.
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpStream;

    let url = url.trim_start_matches("http://");
    let (host_port, path) = url
        .split_once('/')
        .map(|(h, p)| (h, format!("/{p}")))
        .unwrap_or((url, "/".into()));
    let addr = if host_port.contains(':') {
        host_port.to_owned()
    } else {
        format!("{host_port}:80")
    };

    let mut stream = TcpStream::connect(&addr).ok()?;
    stream.set_read_timeout(Some(Duration::from_secs(3))).ok()?;

    let req = format!("GET {path} HTTP/1.0\r\nHost: {host_port}\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).ok()?;

    let mut reader = BufReader::new(stream);
    // Skip headers
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).ok()?;
        if line == "\r\n" || line.is_empty() {
            break;
        }
    }
    let mut body = String::new();
    use std::io::Read;
    reader.read_to_string(&mut body).ok()?;
    serde_json::from_str(&body).ok()
}

fn poll_server(base: &str, state: Arc<Mutex<TuiState>>) {
    // Health
    let health_url = format!("{base}/healthz");
    match fetch_json(&health_url) {
        Some(v) => {
            let status = v["status"].as_str().unwrap_or("?").to_owned();
            let mut s = state.lock().unwrap();
            if s.health != status {
                s.push_event(format!("health → {status}"));
            }
            s.health = status;
        }
        None => {
            let mut s = state.lock().unwrap();
            if s.health != "unreachable" {
                s.push_event("health → unreachable".to_owned());
            }
            s.health = "unreachable".to_owned();
        }
    }

    // Readiness / DB
    let ready_url = format!("{base}/readyz");
    match fetch_json(&ready_url) {
        Some(v) => {
            let db = v["dependencies"]["database"]
                .as_str()
                .unwrap_or("?")
                .to_owned();
            state.lock().unwrap().db_ready = db;
        }
        None => {
            state.lock().unwrap().db_ready = "unreachable".to_owned();
        }
    }

    // Metrics
    let metrics_url = format!("{base}/metricsz");
    if let Some(v) = fetch_json(&metrics_url) {
        let m = &v["metrics"];
        let mut s = state.lock().unwrap();
        let new_sends = m["relay_send_requests_total"]
            .as_u64()
            .unwrap_or(s.relay_sends);
        let new_errs = m["relay_errors_total"].as_u64().unwrap_or(s.relay_errors);
        if new_sends > s.relay_sends {
            s.push_event(format!("relay: {} new send(s)", new_sends - s.relay_sends));
        }
        if new_errs > s.relay_errors {
            s.push_event(format!("relay: {} new error(s)", new_errs - s.relay_errors));
        }
        s.relay_connections = m["relay_connections_total"].as_u64().unwrap_or(0);
        s.relay_sends = new_sends;
        s.relay_errors = new_errs;
        s.relay_thread_subs = m["relay_thread_subscriptions_total"].as_u64().unwrap_or(0);
        s.relay_webtransport_sessions =
            m["relay_webtransport_sessions_total"].as_u64().unwrap_or(0);
        s.last_refresh = Some(Instant::now());
        s.last_error = None;
    }
}

// ── Drawing ───────────────────────────────────────────────────────────────────

fn draw(f: &mut Frame, state: &TuiState) {
    let full = f.area();

    // Outer split: header (3) + body (rest)
    let vert = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Length(3), Constraint::Min(0)])
        .split(full);

    // ── Header ────────────────────────────────────────────────────────────────
    let health_colour = match state.health.as_str() {
        "ok" => Color::Green,
        "unreachable" => Color::Red,
        _ => Color::Yellow,
    };
    let db_colour = match state.db_ready.as_str() {
        "ok" | "ready" => Color::Green,
        "unreachable" => Color::Red,
        _ => Color::Yellow,
    };
    let refresh_ago = state
        .last_refresh
        .map(|t| {
            let s = t.elapsed().as_secs();
            if s < 2 {
                "just now".to_owned()
            } else {
                format!("{s}s ago")
            }
        })
        .unwrap_or_else(|| "—".to_owned());

    let header_line = Line::from(vec![
        Span::raw("  OmnyID Dev Dashboard   "),
        Span::raw("server: "),
        Span::styled(
            format!("● {}", state.health),
            Style::default()
                .fg(health_colour)
                .add_modifier(Modifier::BOLD),
        ),
        Span::raw("   db: "),
        Span::styled(
            format!("● {}", state.db_ready),
            Style::default().fg(db_colour).add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!("   refreshed {refresh_ago}"),
            Style::default().fg(Color::DarkGray),
        ),
        Span::styled(
            "   [r] refresh  [q] quit",
            Style::default().fg(Color::DarkGray),
        ),
    ]);
    let header = Paragraph::new(header_line).block(
        Block::default()
            .borders(Borders::ALL)
            .border_style(Style::default().fg(Color::DarkGray)),
    );
    f.render_widget(header, vert[0]);

    // ── Body: metrics left, event log right ───────────────────────────────────
    let body = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(36), Constraint::Min(0)])
        .split(vert[1]);

    // ── Relay metrics table ───────────────────────────────────────────────────
    let metric_rows = vec![
        Row::new(vec![
            Cell::from("Connections (total)"),
            Cell::from(state.relay_connections.to_string()).style(Style::default().fg(Color::Cyan)),
        ]),
        Row::new(vec![
            Cell::from("Send requests (total)"),
            Cell::from(state.relay_sends.to_string()).style(Style::default().fg(Color::Green)),
        ]),
        Row::new(vec![
            Cell::from("Errors (total)"),
            Cell::from(state.relay_errors.to_string()).style(if state.relay_errors > 0 {
                Style::default().fg(Color::Red)
            } else {
                Style::default().fg(Color::DarkGray)
            }),
        ]),
        Row::new(vec![
            Cell::from("Thread subscriptions"),
            Cell::from(state.relay_thread_subs.to_string())
                .style(Style::default().fg(Color::Magenta)),
        ]),
        Row::new(vec![
            Cell::from("WebTransport sessions"),
            Cell::from(state.relay_webtransport_sessions.to_string())
                .style(Style::default().fg(Color::Yellow)),
        ]),
    ];
    let metrics_table = Table::new(metric_rows, [Constraint::Min(22), Constraint::Length(10)])
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Relay Metrics ")
                .border_style(Style::default().fg(Color::DarkGray)),
        );
    f.render_widget(metrics_table, body[0]);

    // ── Event log ─────────────────────────────────────────────────────────────
    let visible_rows = body[1].height.saturating_sub(2) as usize;
    let log_lines: Vec<Line> = state
        .event_log
        .iter()
        .take(visible_rows)
        .map(|(ts, msg)| {
            Line::from(vec![
                Span::styled(format!("{ts} "), Style::default().fg(Color::DarkGray)),
                Span::raw(msg.as_str()),
            ])
        })
        .collect();
    let log_widget = Paragraph::new(log_lines)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Event Log ")
                .border_style(Style::default().fg(Color::DarkGray)),
        )
        .wrap(Wrap { trim: true });
    f.render_widget(log_widget, body[1]);
}

// ── Entry point ───────────────────────────────────────────────────────────────

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let base_url =
        std::env::var("OMNYID_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".to_owned());

    let state = Arc::new(Mutex::new(TuiState::default()));

    // Initial poll before entering raw mode so the first frame has real data.
    poll_server(&base_url, Arc::clone(&state));

    // Background poller thread — refreshes every 2 seconds.
    {
        let state = Arc::clone(&state);
        let base = base_url.clone();
        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_secs(2));
                poll_server(&base, Arc::clone(&state));
            }
        });
    }

    // Terminal setup
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = run_loop(&mut terminal, Arc::clone(&state));

    // Restore terminal regardless of how we exit.
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

fn run_loop(
    terminal: &mut Terminal<CrosstermBackend<io::Stdout>>,
    state: Arc<Mutex<TuiState>>,
) -> Result<(), Box<dyn std::error::Error>> {
    let base_url =
        std::env::var("OMNYID_BASE_URL").unwrap_or_else(|_| "http://localhost:8080".to_owned());
    let mut last_draw = Instant::now();

    loop {
        // Re-draw at most ~20 fps.
        if last_draw.elapsed() >= Duration::from_millis(50) {
            let snapshot = state.lock().unwrap().clone();
            terminal.draw(|f| draw(f, &snapshot))?;
            last_draw = Instant::now();
        }

        // Poll for a key event with a short timeout so the draw loop stays responsive.
        if event::poll(Duration::from_millis(50))? {
            if let Event::Key(key) = event::read()? {
                match key.code {
                    KeyCode::Char('q') | KeyCode::Char('Q') => break,
                    KeyCode::Char('c') if key.modifiers.contains(KeyModifiers::CONTROL) => break,
                    KeyCode::Char('r') | KeyCode::Char('R') => {
                        let state = Arc::clone(&state);
                        let base = base_url.clone();
                        thread::spawn(move || poll_server(&base, state));
                    }
                    _ => {}
                }
            }
        }
    }

    Ok(())
}
