use super::*;

#[derive(serde::Deserialize)]
pub(super) struct GooglePlacePhotoProxyQuery {
    name: String,
    max_width_px: Option<u16>,
}

fn google_place_id_from_photo_name(photo_name: &str) -> Option<&str> {
    let place_id = photo_name
        .strip_prefix("places/")?
        .split_once("/photos/")?
        .0;
    (!place_id.is_empty()
        && place_id.len() <= 256
        && place_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_')))
    .then_some(place_id)
}

async fn fetch_photo_media(
    client: &reqwest::Client,
    key: &str,
    photo_name: &str,
    max_width: u16,
) -> Result<reqwest::Response, (StatusCode, String)> {
    client
        .get(format!(
            "https://places.googleapis.com/v1/{photo_name}/media"
        ))
        .query(&[("key", key), ("maxWidthPx", max_width.to_string().as_str())])
        .send()
        .await
        .map_err(|err| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Google Places photo request failed: {err}"),
            )
        })
}

async fn refreshed_photo_name(
    client: &reqwest::Client,
    key: &str,
    stale_photo_name: &str,
) -> Result<Option<String>, (StatusCode, String)> {
    let Some(place_id) = google_place_id_from_photo_name(stale_photo_name) else {
        return Ok(None);
    };
    let response = client
        .get(format!(
            "https://places.googleapis.com/v1/places/{place_id}"
        ))
        .header("X-Goog-Api-Key", key)
        .header("X-Goog-FieldMask", "photos")
        .send()
        .await
        .map_err(|err| {
            (
                StatusCode::BAD_GATEWAY,
                format!("Google Places photo refresh failed: {err}"),
            )
        })?;
    if !response.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            vendor_provider_http_error("Google Places photo refresh", response).await,
        ));
    }
    let payload = response.json::<Value>().await.map_err(|err| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Google Places photo refresh parse failed: {err}"),
        )
    })?;
    Ok(payload["photos"]
        .as_array()
        .and_then(|photos| photos.first())
        .and_then(|photo| photo["name"].as_str())
        .and_then(clean_google_place_photo_name)
        .filter(|name| name != stale_photo_name))
}

async fn replace_catalogued_photo_url(
    state: &AppState,
    stale_url: &str,
    current_url: &str,
) -> Result<(), (StatusCode, String)> {
    let mut transaction = state.db.pool.begin().await.map_err(photo_db_error)?;
    sqlx::query("UPDATE wedding_vendor_photos SET photo_url = $2 WHERE photo_url = $1")
        .bind(stale_url)
        .bind(current_url)
        .execute(&mut *transaction)
        .await
        .map_err(photo_db_error)?;
    sqlx::query("UPDATE wedding_vendor_room_photos SET photo_url = $2 WHERE photo_url = $1")
        .bind(stale_url)
        .bind(current_url)
        .execute(&mut *transaction)
        .await
        .map_err(photo_db_error)?;
    transaction.commit().await.map_err(photo_db_error)
}

fn photo_db_error(err: sqlx::Error) -> (StatusCode, String) {
    tracing::warn!(%err, "wedding vendor photo catalogue update failed");
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        "Could not update this vendor photo.".to_string(),
    )
}

async fn catalogued_photo_exists(
    state: &AppState,
    proxy_url: &str,
) -> Result<bool, (StatusCode, String)> {
    sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS (
            SELECT 1 FROM wedding_vendor_photos WHERE photo_url = $1
            UNION ALL
            SELECT 1 FROM wedding_vendor_room_photos WHERE photo_url = $1
        )"#,
    )
    .bind(proxy_url)
    .fetch_one(&state.db.pool)
    .await
    .map_err(|err| {
        tracing::warn!(%err, "wedding vendor photo allowlist lookup failed");
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Could not verify this vendor photo.".to_string(),
        )
    })
}

pub(super) async fn wedding_google_place_photo_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GooglePlacePhotoProxyQuery>,
) -> Result<axum::response::Response, (StatusCode, String)> {
    enforce_rate_limit(
        &state,
        public_rate_limit_key("wedding_google_place_photo", &headers),
        RateLimitPolicy {
            max_requests: 120,
            window: Duration::from_secs(60),
        },
    )
    .await?;
    let photo_name = clean_google_place_photo_name(&query.name).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            "Invalid Google Places photo name.".to_string(),
        )
    })?;
    let max_width = query.max_width_px.unwrap_or(720).clamp(120, 1200);
    let proxy_url =
        google_place_photo_proxy_url_at_width(&photo_name, max_width).ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                "Invalid Google Places photo name.".to_string(),
            )
        })?;
    if !catalogued_photo_exists(&state, &proxy_url).await? {
        return Err((StatusCode::NOT_FOUND, "Vendor photo not found.".to_string()));
    }
    if !admin_shared_tool_policy_enabled("google-places-api") {
        return Err((
            StatusCode::FORBIDDEN,
            "Google Places shared wedding-template access is not enabled.".to_string(),
        ));
    }
    let key = resolve_admin_tool_secret(GOOGLE_PLACES_SPEC)
        .map(|secret| secret.secret)
        .ok_or_else(|| {
            (
                StatusCode::SERVICE_UNAVAILABLE,
                "Google Places API key is not configured.".to_string(),
            )
        })?;
    let client = reqwest::Client::new();
    let mut response = fetch_photo_media(&client, &key, &photo_name, max_width).await?;
    if response.status() == StatusCode::BAD_REQUEST {
        if let Some(current_name) = refreshed_photo_name(&client, &key, &photo_name).await? {
            let current_url = google_place_photo_proxy_url_at_width(&current_name, max_width)
                .ok_or_else(|| {
                    (
                        StatusCode::BAD_GATEWAY,
                        "Google Places returned an invalid photo reference.".to_string(),
                    )
                })?;
            let current_response =
                fetch_photo_media(&client, &key, &current_name, max_width).await?;
            if current_response.status().is_success() {
                replace_catalogued_photo_url(&state, &proxy_url, &current_url).await?;
            }
            response = current_response;
        }
    }
    if !response.status().is_success() {
        return Err((
            StatusCode::BAD_GATEWAY,
            vendor_provider_http_error("Google Places photo", response).await,
        ));
    }
    let content_type = response
        .headers()
        .get(axum::http::header::CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| axum::http::HeaderValue::from_static("image/jpeg"));
    let bytes = response.bytes().await.map_err(|err| {
        (
            StatusCode::BAD_GATEWAY,
            format!("Google Places photo response read failed: {err}"),
        )
    })?;
    axum::response::Response::builder()
        .status(StatusCode::OK)
        .header(axum::http::header::CONTENT_TYPE, content_type)
        .header(
            axum::http::header::CACHE_CONTROL,
            axum::http::HeaderValue::from_static(
                "public, max-age=86400, stale-while-revalidate=604800",
            ),
        )
        .body(axum::body::Body::from(bytes))
        .map_err(|err| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                format!("Could not build photo response: {err}"),
            )
        })
}

#[cfg(test)]
mod tests {
    use super::google_place_id_from_photo_name;

    #[test]
    fn photo_name_exposes_only_a_bounded_google_place_id() {
        assert_eq!(
            google_place_id_from_photo_name("places/ChIJ_abc-123/photos/Aa-example"),
            Some("ChIJ_abc-123")
        );
        assert_eq!(
            google_place_id_from_photo_name("places/../../secret/photos/Aa-example"),
            None
        );
        assert_eq!(google_place_id_from_photo_name("places/ChIJ_abc-123"), None);
    }
}
