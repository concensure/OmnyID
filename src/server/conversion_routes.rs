/*
 * @module-id: rust.server.conversion-routes
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

use super::auth::{authenticated_user, enforce_rate_limit};
use super::*;
use axum::{body::Bytes, http::header, response::Response};
use std::env;
use tokio::fs;
use tokio::time::timeout;
use ulid::Ulid;

/// Request body size cap for HTMLâ†’PDF conversion (matches Caddy limit).
const MAX_HTML_BYTES: usize = 32 * 1024 * 1024;

/// Hard wall for the Playwright node subprocess (GAP-096).
const NODE_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new().route("/files/convert/pdf", post(html_to_pdf))
}

#[derive(serde::Deserialize)]
struct HtmlToPdfRequest {
    html: String,
}

fn build_pdf_download_response(bytes: Vec<u8>) -> Response {
    match Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/pdf")
        .header(
            header::CONTENT_DISPOSITION,
            "attachment; filename=\"document.pdf\"",
        )
        .body(axum::body::Body::from(Bytes::from(bytes)))
    {
        Ok(response) => response,
        Err(err) => internal_http_error(err).into_response(),
    }
}

/// Convert an HTML document to PDF via Playwright headless Chromium.
/// Requires `node` and `playwright` to be available on `PATH`, and the
/// `scripts/pdf-from-html.mjs` helper to exist (see OMNYID_SCRIPTS_DIR).
async fn html_to_pdf(
    State(state): State<Arc<AppState>>,
    headers: axum::http::HeaderMap,
    Json(req): Json<HtmlToPdfRequest>,
) -> Response {
    // Auth: only authenticated users may trigger Playwright subprocesses.
    let user = match authenticated_user(&state.db, &headers).await {
        Ok(u) => u,
        Err(resp) => return resp.into_response(),
    };

    // CGAP-009: per-user rate limit â€” 10 conversions / 60 s.
    if let Err(resp) = enforce_rate_limit(
        &state,
        format!("pdf_convert:{}", user.id),
        RateLimitPolicy {
            max_requests: 10,
            window: std::time::Duration::from_secs(60),
        },
    )
    .await
    {
        return resp.into_response();
    }

    if req.html.trim().is_empty() {
        return (StatusCode::BAD_REQUEST, "html field must not be empty").into_response();
    }
    if req.html.len() > MAX_HTML_BYTES {
        return (
            StatusCode::PAYLOAD_TOO_LARGE,
            "html payload exceeds 32 MB limit",
        )
            .into_response();
    }

    // CGAP-008: strip dangerous tags/attributes before handing to headless Chromium.
    // ammonia uses an allowlist â€” <script>, <iframe>, on* event handlers are removed.
    let safe_html = ammonia::clean(&req.html);

    // CGAP-009: global semaphore â€” at most 4 Playwright processes run concurrently.
    let _permit = match state.pdf_semaphore.try_acquire() {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::TOO_MANY_REQUESTS,
                "PDF conversion queue is full â€” try again in a moment",
            )
                .into_response();
        }
    };

    let id = Ulid::new().to_string();
    let tmp = env::temp_dir();
    let input_path = tmp.join(format!("omnyid-{id}.html"));
    let output_path = tmp.join(format!("omnyid-{id}.pdf"));

    if let Err(e) = fs::write(&input_path, safe_html.as_bytes()).await {
        error!("html_to_pdf: failed to write temp html: {e}");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "failed to write temp file",
        )
            .into_response();
    }

    let scripts_dir = env::var("OMNYID_SCRIPTS_DIR").unwrap_or_else(|_| "./scripts".into());
    let script = format!("{scripts_dir}/pdf-from-html.mjs");

    // GAP-096: hard timeout so a hung node process cannot block this thread indefinitely.
    let spawn_result = timeout(
        NODE_TIMEOUT,
        Command::new("node")
            .arg(&script)
            .arg(&input_path)
            .arg(&output_path)
            .output(),
    )
    .await;

    if let Err(e) = fs::remove_file(&input_path).await {
        tracing::warn!(
            "html_to_pdf: failed to remove temp input file {:?}: {e}",
            input_path
        );
    }

    match spawn_result {
        Err(_elapsed) => {
            error!(
                "html_to_pdf: node subprocess timed out after {}s",
                NODE_TIMEOUT.as_secs()
            );
            if let Err(e) = fs::remove_file(&output_path).await {
                tracing::warn!(
                    "html_to_pdf: failed to remove temp output file {:?}: {e}",
                    output_path
                );
            }
            (StatusCode::GATEWAY_TIMEOUT, "PDF generation timed out").into_response()
        }
        Ok(Err(e)) => {
            error!("html_to_pdf: failed to spawn node: {e}");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "node process could not be spawned â€” is node in PATH?",
            )
                .into_response()
        }
        Ok(Ok(out)) if !out.status.success() => {
            let stderr = String::from_utf8_lossy(&out.stderr);
            let code = out.status.code().unwrap_or(-1);
            error!(code, %stderr, "html_to_pdf: playwright script failed");
            if let Err(e) = fs::remove_file(&output_path).await {
                tracing::warn!(
                    "html_to_pdf: failed to remove temp output file {:?}: {e}",
                    output_path
                );
            }
            let msg = if code == 2 {
                "HTML payload too large for PDF conversion"
            } else {
                "PDF generation failed â€” ensure playwright is installed (npx playwright install chromium)"
            };
            (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
        }
        Ok(Ok(_)) => match fs::read(&output_path).await {
            Err(e) => {
                error!("html_to_pdf: failed to read output pdf: {e}");
                (StatusCode::INTERNAL_SERVER_ERROR, "PDF output missing").into_response()
            }
            Ok(bytes) => {
                if let Err(e) = fs::remove_file(&output_path).await {
                    tracing::warn!(
                        "html_to_pdf: failed to remove temp output file {:?}: {e}",
                        output_path
                    );
                }
                build_pdf_download_response(bytes)
            }
        },
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn conversion_route_uses_explicit_pdf_response_builder_helper() {
        let source = include_str!("conversion_routes.rs");
        assert!(source.contains("fn build_pdf_download_response(bytes: Vec<u8>) -> Response"));
        assert!(source.contains("Err(err) => internal_http_error(err).into_response(),"));
        assert!(source.contains("build_pdf_download_response(bytes)"));
    }
}
