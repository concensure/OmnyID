use axum::{
    extract::Request,
    http::{HeaderValue, header},
    middleware::Next,
    response::Response,
};

pub(super) async fn no_store(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    apply_private_headers(response.headers_mut());
    response
}

fn apply_private_headers(headers: &mut axum::http::HeaderMap) {
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("private, no-store, max-age=0"),
    );
    headers.insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    headers.insert(
        "x-robots-tag",
        HeaderValue::from_static("noindex, nofollow, noarchive"),
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn capability_responses_are_private_and_not_indexable() {
        let mut headers = axum::http::HeaderMap::new();
        apply_private_headers(&mut headers);
        assert_eq!(
            headers[header::CACHE_CONTROL],
            "private, no-store, max-age=0"
        );
        assert_eq!(headers[header::REFERRER_POLICY], "no-referrer");
        assert_eq!(headers["x-robots-tag"], "noindex, nofollow, noarchive");
    }
}
