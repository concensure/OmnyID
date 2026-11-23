    use super::*;

    fn record(key: &str, value: Value) -> VendorAttributeRecord {
        VendorAttributeRecord {
            vendor_id: "v1".to_string(),
            attribute_key: key.to_string(),
            value: Some(value),
            status: "known".to_string(),
            confidence: Some(0.9),
            authority: "primary_official".to_string(),
            source_url: None,
            source_label: None,
            retrieved_at: "2026-09-20".to_string(),
            valid_until: None,
            notes: None,
        }
    }

    #[test]
    fn catalog_keys_are_unique_and_enums_non_empty() {
        let mut seen = std::collections::HashSet::new();
        for spec in VENDOR_ATTRIBUTE_CATALOG {
            assert!(seen.insert(spec.key), "duplicate key {}", spec.key);
            if let AttrKind::Enum(values) = spec.kind {
                assert!(!values.is_empty(), "{} has no enum values", spec.key);
            }
            assert!(VENDOR_ATTRIBUTE_AUTHORITIES.contains(&spec.preferred_authority));
        }
    }

    #[test]
    fn aggregate_attributes_prefer_independent_aggregate() {
        for key in [
            "rating_google",
            "review_count_google",
            "business_status",
            "rating_easyweddings",
            "latitude",
            "longitude",
        ] {
            assert_eq!(
                attribute_spec(key).expect("spec").preferred_authority,
                "independent_aggregate"
            );
        }
        assert_eq!(
            attribute_spec("capacity_seated_max")
                .expect("spec")
                .preferred_authority,
            "primary_official"
        );
    }

    #[test]
    fn catalog_v2_validates_coordinates_and_structured_seasonal_prices() {
        assert!(admin_attribute_write(admin("latitude", Some(json!(-33.8688)), "known")).is_ok());
        assert!(admin_attribute_write(admin("longitude", Some(json!(151.2093)), "known")).is_ok());
        assert!(admin_attribute_write(admin("latitude", Some(json!(-133.0)), "known")).is_err());
        assert!(
            admin_attribute_write(admin(
                "seasonal_price_list",
                Some(json!("https://venue.test/pricing.pdf")),
                "known"
            ))
            .is_ok()
        );
        assert!(admin_attribute_write(admin("condition_score", Some(json!(4.5)), "known")).is_ok());
        assert!(admin_attribute_write(admin("food_score", Some(json!(0)), "known")).is_err());
        assert!(admin_attribute_write(admin("service_score", Some(json!(6)), "known")).is_err());
    }

    #[test]
    fn unknowns_fill_venue_only_keys_for_venues_but_not_photographers() {
        let venue = attributes_with_unknowns("Venue", &[record("capacity_seated_max", json!(120))]);
        assert_eq!(venue["capacity_seated_max"]["value"], json!(120));
        assert_eq!(venue["capacity_standing_max"]["status"], json!("unknown"));
        assert_eq!(venue["capacity_standing_max"]["value"], Value::Null);
        assert!(venue.get("backup_shooter").is_none());
        assert_eq!(venue["rating_google"]["status"], json!("unknown"));

        let photographer = attributes_with_unknowns("photographer", &[]);
        assert!(photographer.get("capacity_seated_max").is_none());
        assert!(photographer.get("corkage_fee_aud").is_none());
        assert_eq!(photographer["backup_shooter"]["status"], json!("unknown"));
        assert_eq!(
            photographer["wheelchair_accessible"]["status"],
            json!("unknown")
        );
    }

    fn admin(key: &str, value: Option<Value>, status: &str) -> AdminAttributeInput {
        AdminAttributeInput {
            key: key.to_string(),
            value,
            status: status.to_string(),
            confidence: None,
            source_url: None,
            notes: None,
        }
    }

    #[test]
    fn admin_input_rejects_unknown_keys_and_names_the_key() {
        let err = admin_attribute_write(admin("made_up", Some(json!(1)), "known"))
            .err()
            .expect("rejected");
        assert!(err.contains("made_up"));
        assert!(err.contains("catalog"));
    }

    #[test]
    fn admin_input_rejects_wrong_kinds() {
        assert!(
            admin_attribute_write(admin("capacity_seated_max", Some(json!("lots")), "known"))
                .is_err()
        );
        assert!(
            admin_attribute_write(admin("capacity_seated_max", Some(json!(-5)), "known")).is_err()
        );
        assert!(admin_attribute_write(admin("pets_allowed", Some(json!("yes")), "known")).is_err());
        assert!(
            admin_attribute_write(admin(
                "wet_weather_option",
                Some(json!("sometimes")),
                "known"
            ))
            .is_err()
        );
        assert!(admin_attribute_write(admin("curfew_time", Some(json!("late")), "known")).is_err());
        assert!(
            admin_attribute_write(admin("official_website", Some(json!("ftp://x")), "known"))
                .is_err()
        );
        assert!(
            admin_attribute_write(admin("style_tags", Some(json!(["ok", 3])), "known")).is_err()
        );
        assert!(admin_attribute_write(admin("pets_allowed", None, "known")).is_err());
    }

    #[test]
    fn admin_input_accepts_valid_values_with_operator_authority() {
        let write = admin_attribute_write(admin("capacity_seated_max", Some(json!(140)), "known"))
            .expect("valid");
        assert_eq!(write.authority, "operator");
        assert_eq!(write.value, Some(json!(140)));
        let unknown = admin_attribute_write(admin("pets_allowed", Some(json!(true)), "unknown"))
            .expect("valid");
        assert_eq!(unknown.value, None);
        assert!(
            admin_attribute_write(admin("curfew_time", Some(json!("23:00")), "estimated")).is_ok()
        );
    }

    #[test]
    fn admin_input_rejects_bad_status_and_confidence() {
        assert!(admin_attribute_write(admin("pets_allowed", Some(json!(true)), "maybe")).is_err());
        let mut input = admin("pets_allowed", Some(json!(true)), "known");
        input.confidence = Some(1.5);
        assert!(admin_attribute_write(input).is_err());
    }

    #[test]
    fn pending_attribute_converts_with_ttl_and_rejects_off_catalog_keys() {
        let now = chrono::Utc::now();
        let write =
            PendingAttribute::known("rating_google", json!(4.7), "independent_aggregate", 180)
                .into_write(now)
                .expect("write");
        assert_eq!(write.preferred_authority, "independent_aggregate");
        assert!(write.valid_until.is_some());
        assert!(
            PendingAttribute::known("not_a_key", json!(1), "inferred", 1)
                .into_write(now)
                .is_none()
        );
        assert!(
            PendingAttribute::known("rating_google", json!("high"), "inferred", 1)
                .into_write(now)
                .is_none()
        );
    }

    #[test]
    fn catalog_json_lists_enum_values_and_scope() {
        let catalog = attribute_catalog_json();
        let status = catalog
            .as_array()
            .expect("array")
            .iter()
            .find(|entry| entry["key"] == "business_status")
            .expect("entry");
        assert_eq!(status["kind"], json!("enum"));
        assert_eq!(status["enum_values"].as_array().expect("values").len(), 3);
    }

    #[test]
    fn style_facets_are_limited_to_the_shared_versioned_vocabulary() {
        assert!(admin_attribute_write(admin("style_facets", Some(json!(["scale.intimate"])), "known")).is_ok());
        let error = admin_attribute_write(admin("style_facets", Some(json!(["scale.imaginary"])), "known"))
            .expect_err("unknown facet must be rejected");
        assert!(error.contains("scale.imaginary"));
        assert!(error.contains("wedding_facets.v1"));
    }

