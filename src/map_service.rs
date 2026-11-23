/*
 * @module-id: rust.map-service
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

//! Map service abstraction â€” routes geocoding, directions, and POI queries to the
//! configured provider (Google Maps, Mapbox, or OpenStreetMap/OSRM).
//!
//! Provider is selected per-user via the `map_provider_configs` table; defaults to
//! `google_maps` when an API key is present in `OMNYID_GOOGLE_MAPS_KEY`, otherwise
//! falls back to `osm` (free, no key required).

use crate::admin_tool_secrets::{GOOGLE_MAPS_SPEC, resolve_admin_tool_secret};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

pub const PROVIDER_GOOGLE_MAPS: &str = "google_maps";
pub const PROVIDER_MAPBOX: &str = "mapbox";
pub const PROVIDER_OSM: &str = "osm";

// â”€â”€ Shared data types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatLng {
    pub lat: f64,
    pub lng: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeocodeResult {
    pub display_name: String,
    pub lat: f64,
    pub lng: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub place_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteStep {
    pub instruction: String,
    pub distance_m: f64,
    pub duration_s: f64,
    pub start: LatLng,
    pub end: LatLng,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RouteResult {
    pub distance_m: f64,
    pub duration_s: f64,
    pub steps: Vec<RouteStep>,
    /// Encoded polyline (Google format) for map rendering; None for OSM.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub polyline: Option<String>,
    /// Human-readable distance, e.g. "12.4 km"
    pub distance_text: String,
    /// Human-readable duration, e.g. "18 mins"
    pub duration_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaceResult {
    pub name: String,
    pub lat: f64,
    pub lng: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub place_id: Option<String>,
    #[serde(default)]
    pub types: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub distance_m: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vicinity: Option<String>,
}

/// Tile layer config sent to the frontend so it can render the right tiles.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TileConfig {
    pub provider: String,
    pub tile_url_template: String,
    pub attribution: String,
    pub max_zoom: u8,
}

// â”€â”€ Provider trait â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

#[async_trait]
pub trait MapProvider: Send + Sync {
    fn provider_id(&self) -> &'static str;
    fn tile_config(&self) -> TileConfig;

    async fn geocode(&self, query: &str) -> Result<Vec<GeocodeResult>, String>;
    async fn reverse_geocode(&self, lat: f64, lng: f64) -> Result<Option<GeocodeResult>, String>;
    async fn directions(
        &self,
        origin: &LatLng,
        destination: &LatLng,
        mode: &str,
    ) -> Result<Option<RouteResult>, String>;
    async fn places_nearby(
        &self,
        center: &LatLng,
        radius_m: f64,
        place_type: &str,
    ) -> Result<Vec<PlaceResult>, String>;
}

// â”€â”€ Google Maps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct GoogleMapsProvider {
    api_key: String,
    client: reqwest::Client,
}

impl GoogleMapsProvider {
    pub fn new(api_key: String) -> Self {
        Self {
            api_key,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl MapProvider for GoogleMapsProvider {
    fn provider_id(&self) -> &'static str {
        PROVIDER_GOOGLE_MAPS
    }

    fn tile_config(&self) -> TileConfig {
        // Google Maps JS API handles its own tiles; we expose a generic token URL.
        TileConfig {
            provider: PROVIDER_GOOGLE_MAPS.to_string(),
            tile_url_template: "https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}".to_string(),
            attribution: "Â© Google Maps".to_string(),
            max_zoom: 20,
        }
    }

    async fn geocode(&self, query: &str) -> Result<Vec<GeocodeResult>, String> {
        let url = format!(
            "https://maps.googleapis.com/maps/api/geocode/json?address={}&key={}",
            urlencoding::encode(query),
            self.api_key
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Google geocode request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Google geocode parse failed: {e}"))?;

        if resp["status"].as_str() != Some("OK") {
            return Ok(vec![]);
        }
        let results = resp["results"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|r| GeocodeResult {
                display_name: r["formatted_address"].as_str().unwrap_or("").to_string(),
                lat: r["geometry"]["location"]["lat"].as_f64().unwrap_or(0.0),
                lng: r["geometry"]["location"]["lng"].as_f64().unwrap_or(0.0),
                place_id: r["place_id"].as_str().map(|s| s.to_string()),
                country: None,
            })
            .collect();
        Ok(results)
    }

    async fn reverse_geocode(&self, lat: f64, lng: f64) -> Result<Option<GeocodeResult>, String> {
        let url = format!(
            "https://maps.googleapis.com/maps/api/geocode/json?latlng={},{}&key={}",
            lat, lng, self.api_key
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Google reverse geocode failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Google reverse geocode parse failed: {e}"))?;

        let first = resp["results"].as_array().and_then(|a| a.first()).cloned();
        Ok(first.map(|r| GeocodeResult {
            display_name: r["formatted_address"].as_str().unwrap_or("").to_string(),
            lat,
            lng,
            place_id: r["place_id"].as_str().map(|s| s.to_string()),
            country: None,
        }))
    }

    async fn directions(
        &self,
        origin: &LatLng,
        destination: &LatLng,
        mode: &str,
    ) -> Result<Option<RouteResult>, String> {
        let url = format!(
            "https://maps.googleapis.com/maps/api/directions/json\
             ?origin={},{}&destination={},{}&mode={}&key={}",
            origin.lat, origin.lng, destination.lat, destination.lng, mode, self.api_key
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("Google directions request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Google directions parse failed: {e}"))?;

        if resp["status"].as_str() != Some("OK") {
            return Ok(None);
        }
        let leg = &resp["routes"][0]["legs"][0];
        let distance_m = leg["distance"]["value"].as_f64().unwrap_or(0.0);
        let duration_s = leg["duration"]["value"].as_f64().unwrap_or(0.0);
        let distance_text = leg["distance"]["text"].as_str().unwrap_or("").to_string();
        let duration_text = leg["duration"]["text"].as_str().unwrap_or("").to_string();
        let polyline = resp["routes"][0]["overview_polyline"]["points"]
            .as_str()
            .map(|s| s.to_string());

        let steps = leg["steps"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|s| RouteStep {
                instruction: s["html_instructions"].as_str().unwrap_or("").to_string(),
                distance_m: s["distance"]["value"].as_f64().unwrap_or(0.0),
                duration_s: s["duration"]["value"].as_f64().unwrap_or(0.0),
                start: LatLng {
                    lat: s["start_location"]["lat"].as_f64().unwrap_or(0.0),
                    lng: s["start_location"]["lng"].as_f64().unwrap_or(0.0),
                },
                end: LatLng {
                    lat: s["end_location"]["lat"].as_f64().unwrap_or(0.0),
                    lng: s["end_location"]["lng"].as_f64().unwrap_or(0.0),
                },
            })
            .collect();

        Ok(Some(RouteResult {
            distance_m,
            duration_s,
            steps,
            polyline,
            distance_text,
            duration_text,
        }))
    }

    async fn places_nearby(
        &self,
        center: &LatLng,
        radius_m: f64,
        place_type: &str,
    ) -> Result<Vec<PlaceResult>, String> {
        let url = format!(
            "https://maps.googleapis.com/maps/api/place/nearbysearch/json\
             ?location={},{}&radius={}&type={}&key={}",
            center.lat, center.lng, radius_m as u32, place_type, self.api_key
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Google places request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Google places parse failed: {e}"))?;

        let results = resp["results"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|r| PlaceResult {
                name: r["name"].as_str().unwrap_or("").to_string(),
                lat: r["geometry"]["location"]["lat"].as_f64().unwrap_or(0.0),
                lng: r["geometry"]["location"]["lng"].as_f64().unwrap_or(0.0),
                place_id: r["place_id"].as_str().map(|s| s.to_string()),
                types: r["types"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default()
                    .into_iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect(),
                distance_m: None,
                vicinity: r["vicinity"].as_str().map(|s| s.to_string()),
            })
            .collect();
        Ok(results)
    }
}

// â”€â”€ Mapbox â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct MapboxProvider {
    access_token: String,
    client: reqwest::Client,
}

impl MapboxProvider {
    pub fn new(access_token: String) -> Self {
        Self {
            access_token,
            client: reqwest::Client::new(),
        }
    }
}

#[async_trait]
impl MapProvider for MapboxProvider {
    fn provider_id(&self) -> &'static str {
        PROVIDER_MAPBOX
    }

    fn tile_config(&self) -> TileConfig {
        TileConfig {
            provider: PROVIDER_MAPBOX.to_string(),
            tile_url_template: format!(
                "https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{{z}}/{{x}}/{{y}}?access_token={}",
                self.access_token
            ),
            attribution: "Â© Mapbox Â© OpenStreetMap".to_string(),
            max_zoom: 22,
        }
    }

    async fn geocode(&self, query: &str) -> Result<Vec<GeocodeResult>, String> {
        let url = format!(
            "https://api.mapbox.com/geocoding/v5/mapbox.places/{}.json?access_token={}",
            urlencoding::encode(query),
            self.access_token
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Mapbox geocode request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Mapbox geocode parse failed: {e}"))?;

        let results = resp["features"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|f| {
                let coords = f["center"].as_array().cloned().unwrap_or_default();
                GeocodeResult {
                    display_name: f["place_name"].as_str().unwrap_or("").to_string(),
                    lat: coords.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
                    lng: coords.first().and_then(|v| v.as_f64()).unwrap_or(0.0),
                    place_id: f["id"].as_str().map(|s| s.to_string()),
                    country: None,
                }
            })
            .collect();
        Ok(results)
    }

    async fn reverse_geocode(&self, lat: f64, lng: f64) -> Result<Option<GeocodeResult>, String> {
        let url = format!(
            "https://api.mapbox.com/geocoding/v5/mapbox.places/{},{}.json?access_token={}",
            lng, lat, self.access_token
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Mapbox reverse geocode failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Mapbox reverse geocode parse failed: {e}"))?;

        Ok(resp["features"]
            .as_array()
            .and_then(|a| a.first())
            .map(|f| GeocodeResult {
                display_name: f["place_name"].as_str().unwrap_or("").to_string(),
                lat,
                lng,
                place_id: f["id"].as_str().map(|s| s.to_string()),
                country: None,
            }))
    }

    async fn directions(
        &self,
        origin: &LatLng,
        destination: &LatLng,
        mode: &str,
    ) -> Result<Option<RouteResult>, String> {
        let profile = match mode {
            "driving" | "car" => "mapbox/driving",
            "walking" => "mapbox/walking",
            "cycling" => "mapbox/cycling",
            _ => "mapbox/driving",
        };
        let url = format!(
            "https://api.mapbox.com/directions/v5/{}/{},{};{},{}?steps=true&access_token={}",
            profile, origin.lng, origin.lat, destination.lng, destination.lat, self.access_token
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("Mapbox directions request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Mapbox directions parse failed: {e}"))?;

        let route = match resp["routes"].as_array().and_then(|a| a.first()) {
            Some(r) => r.clone(),
            None => return Ok(None),
        };

        let distance_m = route["distance"].as_f64().unwrap_or(0.0);
        let duration_s = route["duration"].as_f64().unwrap_or(0.0);
        let steps: Vec<RouteStep> = route["legs"]
            .as_array()
            .and_then(|legs| legs.first())
            .and_then(|leg| leg["steps"].as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|s| RouteStep {
                instruction: s["maneuver"]["instruction"]
                    .as_str()
                    .unwrap_or("")
                    .to_string(),
                distance_m: s["distance"].as_f64().unwrap_or(0.0),
                duration_s: s["duration"].as_f64().unwrap_or(0.0),
                start: LatLng {
                    lat: s["maneuver"]["location"]
                        .as_array()
                        .and_then(|c| c.get(1))
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0),
                    lng: s["maneuver"]["location"]
                        .as_array()
                        .and_then(|c| c.first())
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0),
                },
                end: LatLng {
                    lat: destination.lat,
                    lng: destination.lng,
                },
            })
            .collect();

        let distance_text = format!("{:.1} km", distance_m / 1000.0);
        let duration_text = format!("{} mins", (duration_s / 60.0).round() as u32);

        Ok(Some(RouteResult {
            distance_m,
            duration_s,
            steps,
            polyline: route["geometry"].as_str().map(|s| s.to_string()),
            distance_text,
            duration_text,
        }))
    }

    async fn places_nearby(
        &self,
        _center: &LatLng,
        _radius_m: f64,
        _place_type: &str,
    ) -> Result<Vec<PlaceResult>, String> {
        // Mapbox does not have a free places nearby API equivalent to Google's.
        // Return empty; callers should fall back to OSM Overpass for this use case.
        Ok(vec![])
    }
}

// â”€â”€ OpenStreetMap / OSRM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

pub struct OsmProvider {
    client: reqwest::Client,
}

impl OsmProvider {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .user_agent("OmnyID/1.0 (contact: admin@omnyid.com)")
                .build()
                .unwrap_or_default(),
        }
    }
}

impl Default for OsmProvider {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl MapProvider for OsmProvider {
    fn provider_id(&self) -> &'static str {
        PROVIDER_OSM
    }

    fn tile_config(&self) -> TileConfig {
        TileConfig {
            provider: PROVIDER_OSM.to_string(),
            tile_url_template: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png".to_string(),
            attribution: "Â© OpenStreetMap contributors".to_string(),
            max_zoom: 19,
        }
    }

    async fn geocode(&self, query: &str) -> Result<Vec<GeocodeResult>, String> {
        let url = format!(
            "https://nominatim.openstreetmap.org/search?q={}&format=json&limit=5&addressdetails=1",
            urlencoding::encode(query)
        );
        let resp: Vec<serde_json::Value> = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Nominatim geocode request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Nominatim geocode parse failed: {e}"))?;

        let results = resp
            .into_iter()
            .map(|r| GeocodeResult {
                display_name: r["display_name"].as_str().unwrap_or("").to_string(),
                lat: r["lat"]
                    .as_str()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0.0),
                lng: r["lon"]
                    .as_str()
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0.0),
                place_id: r["place_id"].as_u64().map(|id| id.to_string()),
                country: r["address"]["country"].as_str().map(|s| s.to_string()),
            })
            .collect();
        Ok(results)
    }

    async fn reverse_geocode(&self, lat: f64, lng: f64) -> Result<Option<GeocodeResult>, String> {
        let url = format!(
            "https://nominatim.openstreetmap.org/reverse?lat={}&lon={}&format=json",
            lat, lng
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
            .map_err(|e| format!("Nominatim reverse geocode failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Nominatim reverse geocode parse failed: {e}"))?;

        if resp.get("error").is_some() {
            return Ok(None);
        }
        Ok(Some(GeocodeResult {
            display_name: resp["display_name"].as_str().unwrap_or("").to_string(),
            lat,
            lng,
            place_id: resp["place_id"].as_u64().map(|id| id.to_string()),
            country: resp["address"]["country"].as_str().map(|s| s.to_string()),
        }))
    }

    async fn directions(
        &self,
        origin: &LatLng,
        destination: &LatLng,
        mode: &str,
    ) -> Result<Option<RouteResult>, String> {
        let profile = match mode {
            "walking" => "foot",
            "cycling" => "bike",
            _ => "car",
        };
        let url = format!(
            "https://router.project-osrm.org/route/v1/{}/{},{};{},{}?overview=false&steps=true",
            profile, origin.lng, origin.lat, destination.lng, destination.lat
        );
        let resp: serde_json::Value = self
            .client
            .get(&url)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("OSRM directions request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("OSRM directions parse failed: {e}"))?;

        if resp["code"].as_str() != Some("Ok") {
            return Ok(None);
        }

        let route = match resp["routes"].as_array().and_then(|a| a.first()) {
            Some(r) => r.clone(),
            None => return Ok(None),
        };
        let distance_m = route["distance"].as_f64().unwrap_or(0.0);
        let duration_s = route["duration"].as_f64().unwrap_or(0.0);

        let steps: Vec<RouteStep> = route["legs"]
            .as_array()
            .and_then(|legs| legs.first())
            .and_then(|leg| leg["steps"].as_array())
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|s| {
                let loc = s["maneuver"]["location"]
                    .as_array()
                    .cloned()
                    .unwrap_or_default();
                RouteStep {
                    instruction: s["name"].as_str().unwrap_or("").to_string(),
                    distance_m: s["distance"].as_f64().unwrap_or(0.0),
                    duration_s: s["duration"].as_f64().unwrap_or(0.0),
                    start: LatLng {
                        lat: loc.get(1).and_then(|v| v.as_f64()).unwrap_or(0.0),
                        lng: loc.first().and_then(|v| v.as_f64()).unwrap_or(0.0),
                    },
                    end: LatLng {
                        lat: destination.lat,
                        lng: destination.lng,
                    },
                }
            })
            .collect();

        let distance_text = format!("{:.1} km", distance_m / 1000.0);
        let duration_text = format!("{} mins", (duration_s / 60.0).round() as u32);

        Ok(Some(RouteResult {
            distance_m,
            duration_s,
            steps,
            polyline: None,
            distance_text,
            duration_text,
        }))
    }

    async fn places_nearby(
        &self,
        center: &LatLng,
        radius_m: f64,
        place_type: &str,
    ) -> Result<Vec<PlaceResult>, String> {
        // Use Overpass API for POI search.
        let osm_tag = google_type_to_osm_tag(place_type);
        let bbox_delta = radius_m / 111_000.0;
        let overpass_query = format!(
            "[out:json][timeout:10];(node[{osm_tag}]({},{},{},{}););out body;",
            center.lat - bbox_delta,
            center.lng - bbox_delta,
            center.lat + bbox_delta,
            center.lng + bbox_delta,
        );
        let resp: serde_json::Value = self
            .client
            .post("https://overpass-api.de/api/interpreter")
            .body(overpass_query)
            .timeout(std::time::Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| format!("Overpass request failed: {e}"))?
            .json()
            .await
            .map_err(|e| format!("Overpass parse failed: {e}"))?;

        let results = resp["elements"]
            .as_array()
            .cloned()
            .unwrap_or_default()
            .into_iter()
            .map(|el| {
                let lat = el["lat"].as_f64().unwrap_or(0.0);
                let lng = el["lon"].as_f64().unwrap_or(0.0);
                let dlat = lat - center.lat;
                let dlng = lng - center.lng;
                let dist = ((dlat * dlat + dlng * dlng).sqrt()) * 111_000.0;
                PlaceResult {
                    name: el["tags"]["name"].as_str().unwrap_or("").to_string(),
                    lat,
                    lng,
                    place_id: el["id"].as_u64().map(|id| id.to_string()),
                    types: vec![place_type.to_string()],
                    distance_m: Some(dist),
                    vicinity: None,
                }
            })
            .filter(|p| !p.name.is_empty())
            .collect();
        Ok(results)
    }
}

fn google_type_to_osm_tag(place_type: &str) -> &'static str {
    match place_type {
        "supermarket" | "grocery_or_supermarket" => "shop=supermarket",
        "restaurant" => "amenity=restaurant",
        "cafe" => "amenity=cafe",
        "hospital" => "amenity=hospital",
        "pharmacy" => "amenity=pharmacy",
        "gas_station" | "fuel" => "amenity=fuel",
        "parking" => "amenity=parking",
        "bank" => "amenity=bank",
        "atm" => "amenity=atm",
        "train_station" | "subway_station" => "railway=station",
        "bus_station" => "amenity=bus_station",
        _ => "amenity=restaurant",
    }
}

// â”€â”€ MapService facade â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/// Shared facade that holds the active provider and exposes a simple API.
/// Provider can be swapped per-request by constructing a new MapService with
/// a different provider, or by reading the user's `map_provider_configs` row.
pub struct MapService {
    provider: Box<dyn MapProvider>,
}

impl MapService {
    pub fn new(provider: Box<dyn MapProvider>) -> Self {
        Self { provider }
    }

    /// Build a MapService from env vars + optional user preference.
    pub fn from_env(user_preference: Option<&str>) -> Self {
        let pref = user_preference.unwrap_or(PROVIDER_GOOGLE_MAPS);
        match pref {
            PROVIDER_MAPBOX => {
                if let Ok(token) = std::env::var("OMNYID_MAPBOX_TOKEN") {
                    debug!("MapService: using Mapbox provider");
                    return Self::new(Box::new(MapboxProvider::new(token)));
                }
                warn!(
                    "MapService: Mapbox requested but OMNYID_MAPBOX_TOKEN not set; falling back to OSM"
                );
                Self::new(Box::new(OsmProvider::new()))
            }
            PROVIDER_OSM => {
                debug!("MapService: using OSM/OSRM provider");
                Self::new(Box::new(OsmProvider::new()))
            }
            _ => {
                if let Some(key) = resolve_admin_tool_secret(GOOGLE_MAPS_SPEC)
                    .map(|secret| secret.secret)
                    .or_else(|| std::env::var("OMNYID_GOOGLE_MAPS_KEY").ok())
                {
                    debug!("MapService: using Google Maps provider");
                    return Self::new(Box::new(GoogleMapsProvider::new(key)));
                }
                warn!(
                    "MapService: Google Maps requested but no admin/deployment Google Maps key is set; falling back to OSM"
                );
                Self::new(Box::new(OsmProvider::new()))
            }
        }
    }

    pub fn provider_id(&self) -> &str {
        self.provider.provider_id()
    }

    pub fn tile_config(&self) -> TileConfig {
        self.provider.tile_config()
    }

    pub async fn geocode(&self, query: &str) -> Result<Vec<GeocodeResult>, String> {
        self.provider.geocode(query).await
    }

    pub async fn reverse_geocode(
        &self,
        lat: f64,
        lng: f64,
    ) -> Result<Option<GeocodeResult>, String> {
        self.provider.reverse_geocode(lat, lng).await
    }

    pub async fn directions(
        &self,
        origin: &LatLng,
        destination: &LatLng,
        mode: &str,
    ) -> Result<Option<RouteResult>, String> {
        self.provider.directions(origin, destination, mode).await
    }

    pub async fn places_nearby(
        &self,
        center: &LatLng,
        radius_m: f64,
        place_type: &str,
    ) -> Result<Vec<PlaceResult>, String> {
        self.provider
            .places_nearby(center, radius_m, place_type)
            .await
    }
}
