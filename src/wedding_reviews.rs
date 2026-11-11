//! Typed policy for Wedding planner and venue reviews.
//!
//! Narrative and evidence remain in tenant-private AFP messages/attachments.
//! This module owns lifecycle and aggregate eligibility only; it does not send
//! invitations, publish content or influence vendor ranking.

use serde::{Deserialize, Serialize};

pub const SPARSE_SCORE_THRESHOLD: usize = 3;

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewSubjectKind {
    Planner,
    Vendor,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewExperienceKind {
    PlannerTask,
    Resource,
    WeddingHeld,
    Booking,
    EnquiryTour,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewVerificationState {
    Unreviewed,
    Pending,
    VerifiedActivity,
    VerifiedBooking,
    VerifiedWeddingHeld,
    Insufficient,
    Conflicted,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewStatus {
    Draft,
    Submitted,
    EvidenceRequested,
    ModerationPending,
    Published,
    EditPending,
    Rejected,
    Restricted,
    Restored,
    Withdrawn,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReviewAudience {
    PrivateFeedback,
    PublicReview,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReviewPolicyInput {
    pub subject: ReviewSubjectKind,
    pub experience: ReviewExperienceKind,
    pub verification: ReviewVerificationState,
    pub audience: ReviewAudience,
    pub rating: Option<u8>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PublishedScore {
    pub rating: u8,
    pub aggregate_eligible: bool,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReviewAggregate {
    pub count: usize,
    pub average_tenths: Option<u16>,
    pub show_compact_score: bool,
}

pub fn transition_allowed(from: ReviewStatus, to: ReviewStatus) -> bool {
    use ReviewStatus::*;
    matches!(
        (from, to),
        (Draft, Submitted)
            | (Draft, Withdrawn)
            | (Submitted, EvidenceRequested)
            | (Submitted, ModerationPending)
            | (Submitted, Withdrawn)
            | (EvidenceRequested, ModerationPending)
            | (EvidenceRequested, Rejected)
            | (EvidenceRequested, Withdrawn)
            | (ModerationPending, Published)
            | (ModerationPending, Rejected)
            | (ModerationPending, EvidenceRequested)
            | (ModerationPending, Withdrawn)
            | (Published, EditPending)
            | (Published, Restricted)
            | (Published, Withdrawn)
            | (EditPending, Published)
            | (EditPending, Rejected)
            | (EditPending, Restricted)
            | (EditPending, Withdrawn)
            | (Restricted, Restored)
            | (Restricted, Withdrawn)
            | (Restored, EditPending)
            | (Restored, Restricted)
            | (Restored, Withdrawn)
            | (Rejected, Draft)
    )
}

pub fn validate_policy(input: ReviewPolicyInput) -> Result<PublishedScore, &'static str> {
    let rating = match input.rating {
        Some(1..=5) => input.rating,
        Some(_) => return Err("rating must be an integer from 1 to 5"),
        None => None,
    };
    if input.audience == ReviewAudience::PublicReview
        && matches!(input.experience, ReviewExperienceKind::EnquiryTour)
    {
        return Err("enquiry and tour feedback remains private in the pilot");
    }
    if input.audience == ReviewAudience::PublicReview
        && matches!(
            input.experience,
            ReviewExperienceKind::PlannerTask | ReviewExperienceKind::WeddingHeld
        )
        && rating.is_none()
    {
        return Err("a public planner or wedding-held review requires a rating");
    }
    if input.subject == ReviewSubjectKind::Planner
        && !matches!(
            input.experience,
            ReviewExperienceKind::PlannerTask | ReviewExperienceKind::Resource
        )
    {
        return Err("planner reviews require planner-task or resource experience");
    }
    if input.subject == ReviewSubjectKind::Vendor
        && matches!(input.experience, ReviewExperienceKind::PlannerTask)
    {
        return Err("venue reviews cannot claim planner-task experience");
    }
    let aggregate_eligible = input.audience == ReviewAudience::PublicReview
        && input.subject == ReviewSubjectKind::Vendor
        && input.experience == ReviewExperienceKind::WeddingHeld
        && input.verification == ReviewVerificationState::VerifiedWeddingHeld
        && rating.is_some();
    Ok(PublishedScore {
        rating: rating.unwrap_or_default(),
        aggregate_eligible,
    })
}

/// Builds the public venue aggregate from the exact eligible scored set.
/// `average_tenths` uses positive integer half-up rounding.
pub fn aggregate_eligible_scores(scores: &[u8]) -> Result<ReviewAggregate, &'static str> {
    if scores.iter().any(|score| !(1..=5).contains(score)) {
        return Err("aggregate contains an invalid rating");
    }
    if scores.is_empty() {
        return Ok(ReviewAggregate {
            count: 0,
            average_tenths: None,
            show_compact_score: false,
        });
    }
    let count = scores.len();
    let total = scores.iter().map(|score| u32::from(*score)).sum::<u32>();
    let average_tenths = ((total * 10 + (count as u32 / 2)) / count as u32) as u16;
    Ok(ReviewAggregate {
        count,
        average_tenths: Some(average_tenths),
        show_compact_score: count >= SPARSE_SCORE_THRESHOLD,
    })
}

pub fn review_supertags(review_id: &str, subject: ReviewSubjectKind) -> Vec<String> {
    let subject_tag = match subject {
        ReviewSubjectKind::Planner => "wedding_review_planner",
        ReviewSubjectKind::Vendor => "wedding_review_vendor",
    };
    vec![
        "wedding_review".to_string(),
        format!("review:{}", review_id.trim()),
        subject_tag.to_string(),
    ]
}

pub fn audit_metadata_keys_allowed(keys: impl IntoIterator<Item = String>) -> bool {
    const ALLOWED: &[&str] = &[
        "policy_outcome",
        "reason_code",
        "result",
        "schema_version",
        "subject_kind",
        "verification_state",
    ];
    keys.into_iter().all(|key| ALLOWED.contains(&key.as_str()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn public_wedding(verification: ReviewVerificationState) -> ReviewPolicyInput {
        ReviewPolicyInput {
            subject: ReviewSubjectKind::Vendor,
            experience: ReviewExperienceKind::WeddingHeld,
            verification,
            audience: ReviewAudience::PublicReview,
            rating: Some(5),
        }
    }

    #[test]
    fn only_verified_wedding_held_reviews_enter_venue_aggregate() {
        assert!(
            validate_policy(public_wedding(ReviewVerificationState::VerifiedWeddingHeld))
                .unwrap()
                .aggregate_eligible
        );
        assert!(
            !validate_policy(public_wedding(ReviewVerificationState::VerifiedBooking))
                .unwrap()
                .aggregate_eligible
        );
    }

    #[test]
    fn booking_review_can_publish_but_never_enters_wedding_score() {
        let result = validate_policy(ReviewPolicyInput {
            subject: ReviewSubjectKind::Vendor,
            experience: ReviewExperienceKind::Booking,
            verification: ReviewVerificationState::VerifiedBooking,
            audience: ReviewAudience::PublicReview,
            rating: Some(2),
        })
        .unwrap();
        assert!(!result.aggregate_eligible);
    }

    #[test]
    fn enquiry_and_tour_feedback_is_private_in_pilot() {
        let error = validate_policy(ReviewPolicyInput {
            subject: ReviewSubjectKind::Vendor,
            experience: ReviewExperienceKind::EnquiryTour,
            verification: ReviewVerificationState::Unreviewed,
            audience: ReviewAudience::PublicReview,
            rating: Some(4),
        })
        .unwrap_err();
        assert!(error.contains("remains private"));
    }

    #[test]
    fn public_wedding_review_requires_a_score() {
        let mut input = public_wedding(ReviewVerificationState::VerifiedWeddingHeld);
        input.rating = None;
        assert!(validate_policy(input).is_err());
    }

    #[test]
    fn sparse_aggregate_hides_compact_average_until_three_reviews() {
        let two = aggregate_eligible_scores(&[5, 4]).unwrap();
        assert_eq!(two.average_tenths, Some(45));
        assert!(!two.show_compact_score);
        assert!(
            aggregate_eligible_scores(&[5, 4, 4])
                .unwrap()
                .show_compact_score
        );
    }

    #[test]
    fn aggregate_uses_deterministic_half_up_tenths() {
        assert_eq!(
            aggregate_eligible_scores(&[5, 4, 4])
                .unwrap()
                .average_tenths,
            Some(43)
        );
        assert_eq!(
            aggregate_eligible_scores(&[5, 4, 3, 2])
                .unwrap()
                .average_tenths,
            Some(35)
        );
    }

    #[test]
    fn lifecycle_keeps_withdrawal_and_restriction_explicit() {
        assert!(transition_allowed(
            ReviewStatus::Published,
            ReviewStatus::Withdrawn
        ));
        assert!(transition_allowed(
            ReviewStatus::Published,
            ReviewStatus::Restricted
        ));
        assert!(transition_allowed(
            ReviewStatus::Restricted,
            ReviewStatus::Restored
        ));
        assert!(!transition_allowed(
            ReviewStatus::Draft,
            ReviewStatus::Published
        ));
    }

    #[test]
    fn audit_metadata_rejects_content_and_contact_fields() {
        assert!(audit_metadata_keys_allowed([
            "reason_code".to_string(),
            "result".to_string()
        ]));
        assert!(!audit_metadata_keys_allowed(["review_text".to_string()]));
        assert!(!audit_metadata_keys_allowed(["reviewer_email".to_string()]));
    }

    #[test]
    fn afp_supertags_bind_review_and_subject() {
        assert_eq!(
            review_supertags("rev-1", ReviewSubjectKind::Vendor),
            vec!["wedding_review", "review:rev-1", "wedding_review_vendor"]
        );
    }
}
