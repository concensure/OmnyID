# Planning Tools Registry
#
# Add tools/APIs here. The planning LLM will automatically discover them.
#
# HOW IT WORKS (progressive disclosure):
#   1. Intent parser sees ONLY the `hint:` line for every tool (~1-2 tokens per tool).
#      It returns `tools_needed: ["id", ...]` for tools relevant to the query.
#   2. Conditions analyser receives the full `schema:` block ONLY for selected tools.
#      This keeps prompt sizes small regardless of how many tools are registered.
#   3. Result composer receives tool outputs (or stub notices) for selected tools only.
#
# FORMAT:
#   ## <tool_id>
#   hint: <one-liner — shown to EVERY intent parser invocation; keep it ≤15 words>
#   schema:
#     <signature and return shape — shown only when selected; can be multi-line>
#   status: stub | live
#
# Use status: stub until the tool is wired to a real API. Stub tools return a notice
# so the LLM uses its best general knowledge while flagging the confidence correctly.

## maps_directions
hint: Driving, transit, walking or cycling routes with real-time travel times and distances
schema:
  maps_directions(origin: str, destination: str, depart_at: str, modes: list[str], avoid_tolls: bool) -> RouteResult
  RouteResult.options[]: { mode, duration_min, distance_km, steps: [str], fare_aud, notes }
  modes: "driving" | "transit" | "walking" | "cycling"
  depart_at: ISO-8601 or "now" or "in 30 mins"
status: stub

## public_transport
hint: Real-time train, bus and ferry timetables, platform numbers, service alerts and disruptions
schema:
  public_transport(origin: str, destination: str, depart_at: str) -> TransitResult
  TransitResult.services[]: { line, depart, arrive, platform, alerts: [str] }
  TransitResult.disruptions[]: str
status: stub

## weather_forecast
hint: Current weather and short-range forecast (up to 48 h) including rain probability and alerts
schema:
  weather_forecast(location: str, hours_ahead: int = 3) -> WeatherResult
  WeatherResult: { temp_c, feels_like_c, condition: str, rain_probability_pct, wind_kmh, alerts: [str] }
  provider: WeatherAPI (https://www.weatherapi.com)
  backup_provider: Weatherstack (https://weatherstack.com)
api_key_env: PLANNING_WEATHERAPI_KEY
backup_api_key_env: PLANNING_WEATHERSTACK_KEY
status: live

## calendar_read
hint: Read upcoming calendar events to check schedule conflicts or derive timing constraints
schema:
  calendar_read(hours_from_now: int = 24) -> CalendarResult
  CalendarResult.events[]: { title, start: ISO-8601, end: ISO-8601, location }
  Autonomy: silent (read-only; no confirmation required)
status: stub

## venue_resolver
hint: Resolve vague place names ("the city", "my office") to precise addresses or coordinates
schema:
  venue_resolver(query: str, context_suburb: str = "") -> VenueResult
  VenueResult: { resolved_name: str, address: str, lat: f64, lng: f64, confidence: "high"|"medium"|"low" }
status: stub

## user_profile_read
hint: Read stored user preferences — home/work addresses, preferred transport, accessibility needs
schema:
  user_profile_read() -> ProfileResult
  ProfileResult: { home_address, work_address, preferred_modes: [str], avoid_tolls: bool, accessibility_needs: [str] }
  Autonomy: silent (read-only; no confirmation required)
status: stub

## events_nearby
hint: Upcoming events near a location (concerts, sports, markets) that may affect traffic or crowds
schema:
  events_nearby(location: str, radius_km: float = 2.0, hours_ahead: int = 6) -> EventsResult
  EventsResult.events[]: { name, venue, start, category, expected_crowd: "low"|"medium"|"high" }
status: stub

## parking_availability
hint: Parking availability and estimated cost near a destination
schema:
  parking_availability(location: str, arrive_at: str, duration_hours: float = 2.0) -> ParkingResult
  ParkingResult.options[]: { name, distance_m, spaces_available, price_per_hour_aud, notes }
status: stub

## export_to_file
hint: Export structured data (table, ledger, summary) to CSV or XLSX and attach as AFP download
schema:
  export_to_file(format: "csv"|"xlsx", filename: str, columns: list[str], rows: list[list[str]]) -> ExportResult
  ExportResult: { ok: bool, filename: str, size_bytes: int, download_url: str | None, data: str | None }
  Approval: when rows > 500 or format="xlsx", emit an AFP export_request message first and wait for user approval
  Safety: agent never writes files directly — always calls POST /export/file through the gated service
  Max rows: 10 000 per request
status: live

## walk_score
hint: Walkability, transit and bike score for an address — how walkable/bikeable is a location
schema:
  walk_score(address: str, lat: float = None, lng: float = None) -> WalkScoreResult
  WalkScoreResult: { walk_score: int, walk_description: str, transit_score: int, transit_description: str, bike_score: int, bike_description: str }
  scores: 0–100 (90–100 = Walker's Paradise, 70–89 = Very Walkable, 50–69 = Somewhat Walkable, 25–49 = Car-Dependent, 0–24 = Almost All Errands Require a Car)
  provider: Walk Score API (https://www.walkscore.com/professional/api.php)
api_key_env: PLANNING_WALKSCORE_KEY
status: stub
