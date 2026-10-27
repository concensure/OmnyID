use super::*;
use chrono::{DateTime, Utc};
use sha2::{Digest, Sha256};

/// Transport is deliberately not an authority: all surfaces use the same decision.
#[derive(Clone, Copy, Debug)]
pub enum AccessSurface {
    Http,
    Search,
    Websocket,
    Cache,
    Attachment,
    Export,
}

/// Construct only from server-verified ownership/current ledger state.
/// Neither this nor its proofs implement Deserialize.
pub enum AuthorityProof {
    Practice {
        membership: Grant,
        collaboration: Option<Grant>,
    },
    Couple {
        ownership: Grant,
    },
    Vendor {
        grant: Grant,
        resource_id: String,
    },
}

pub struct AuthoritySnapshot {
    pub actor_account_id: String,
    pub practice_id: String,
    pub plan: Option<PlanRef>,
    pub revision: AuthorityRevision,
    pub proof: AuthorityProof,
}

/// Maximum role permissions. Explicit grants may narrow these but cannot widen them.
pub fn role_allows(role: Role, capability: Capability) -> bool {
    use Action::*;
    use Resource::*;
    use Role::*;
    let Capability { resource, action } = capability;
    match role {
        PracticeOwner if matches!(resource, PracticeSettings | Membership) => {
            matches!(action, Read | Manage)
        }
        PracticeOwner | LeadPlanner => match resource {
            PracticeSettings | Membership => action == Read,
            ClientIndex | Plan | Tasks | Calendar => {
                matches!(action, Read | Propose | Edit | Assign)
            }
            Conversation => matches!(action, Read | Propose | Send),
            Documents | Guests | SensitiveNotes | FinancialEvidence | PaymentTracking => {
                matches!(action, Read | Propose | Edit)
            }
            FinancialSummary | SupplierProfile => action == Read,
            Quotation => matches!(action, Read | Propose | Accept),
            Hold => matches!(action, Read | Propose | Edit | Accept),
            Booking => matches!(action, Read | Propose),
            Collaboration => action == Read,
        },
        Coordinator => match resource {
            ClientIndex | Plan | FinancialSummary | SupplierProfile => action == Read,
            Tasks | Calendar => matches!(action, Read | Propose | Edit | Assign),
            Conversation => matches!(action, Read | Propose | Send),
            Documents | Guests | Quotation | Hold | Booking => matches!(action, Read | Propose),
            _ => false,
        },
        FinanceOnly => match resource {
            ClientIndex | FinancialSummary => action == Read,
            FinancialEvidence | PaymentTracking => matches!(action, Read | Propose | Edit),
            _ => false,
        },
        ReadOnly => {
            action == Read && !matches!(resource, PracticeSettings | Membership | Collaboration)
        }
        CoupleOwner | CoupleCoOwner => match resource {
            PracticeSettings | Membership | ClientIndex => false,
            Collaboration => matches!(action, Read | Manage),
            Conversation => matches!(action, Read | Propose | Send),
            Quotation | Hold => matches!(action, Read | Propose | Accept),
            Booking => matches!(action, Read | Propose),
            SupplierProfile | FinancialSummary => action == Read,
            Tasks | Calendar => matches!(action, Read | Propose | Edit | Assign),
            _ => matches!(action, Read | Propose | Edit),
        },
        VendorRepresentative => match resource {
            SupplierProfile | Quotation | Hold => matches!(action, Read | Propose | Edit | Send),
            Conversation => matches!(action, Read | Propose | Send),
            Booking => matches!(action, Read | Confirm),
            FinancialSummary => action == Read,
            FinancialEvidence | PaymentTracking => matches!(action, Read | Propose | Edit),
            _ => false,
        },
    }
}

fn live(grant: &Grant, actor: &str, now: DateTime<Utc>) -> bool {
    let parse = |value: &str| DateTime::parse_from_rfc3339(value).map(|v| v.with_timezone(&Utc));
    grant.subject_account_id == actor
        && !grant.grant_id.trim().is_empty()
        && grant.revoked_at.is_none()
        && parse(&grant.valid_from).is_ok_and(|start| start <= now)
        && grant
            .expires_at
            .as_ref()
            .is_none_or(|expiry| parse(expiry).is_ok_and(|end| now < end))
}

pub fn authorize(
    snapshot: &AuthoritySnapshot,
    command: &CommandEnvelope,
    _surface: AccessSurface,
    now: DateTime<Utc>,
) -> Result<(), PracticeError> {
    validate_command(command)?;
    if snapshot.actor_account_id != command.actor_account_id
        || snapshot.practice_id != command.practice_id
        || snapshot.plan != command.plan
    {
        return Err(PracticeError::Forbidden);
    }
    if snapshot.revision != command.expected_authority {
        return Err(PracticeError::StaleAuthority);
    }
    let cap = command.capability;
    let granted = |grant: &Grant| {
        live(grant, &snapshot.actor_account_id, now)
            && role_allows(grant.role, cap)
            && grant.capabilities.contains(&cap)
    };
    let allowed = match &snapshot.proof {
        AuthorityProof::Practice {
            membership,
            collaboration,
        } => {
            let practice_role = matches!(
                membership.role,
                Role::PracticeOwner
                    | Role::LeadPlanner
                    | Role::Coordinator
                    | Role::FinanceOnly
                    | Role::ReadOnly
            );
            practice_role
                && membership.practice_id == snapshot.practice_id
                && membership.plan.is_none()
                && membership.resource_id.is_none()
                && granted(membership)
                && if matches!(
                    cap.resource,
                    Resource::PracticeSettings | Resource::Membership
                ) {
                    snapshot.plan.is_none()
                } else {
                    snapshot.plan.is_some()
                        && collaboration.as_ref().is_some_and(|grant| {
                            grant.role == membership.role
                                && grant.practice_id == snapshot.practice_id
                                && grant.plan == snapshot.plan
                                && grant.resource_id.is_none()
                                && granted(grant)
                        })
                }
        }
        AuthorityProof::Couple { ownership } => {
            snapshot.plan.is_some()
                && ownership.practice_id == snapshot.practice_id
                && ownership.plan == snapshot.plan
                && ownership.resource_id.is_none()
                && matches!(ownership.role, Role::CoupleOwner | Role::CoupleCoOwner)
                && granted(ownership)
        }
        AuthorityProof::Vendor { grant, resource_id } => {
            snapshot.plan.is_some()
                && grant.role == Role::VendorRepresentative
                && resource_id == &command.resource_id
                && grant.practice_id == snapshot.practice_id
                && grant.plan == snapshot.plan
                && grant.resource_id.as_ref() == Some(resource_id)
                && granted(grant)
        }
    };
    if allowed {
        Ok(())
    } else {
        Err(PracticeError::Forbidden)
    }
}

/// Call after authorisation even on retries. Receipts must be scoped to actor, practice,
/// plan and idempotency key; persist/check them atomically with the ledger append.
pub fn command_digest(
    command: &CommandEnvelope,
    payload: &PracticeEventPayload,
) -> Result<String, PracticeError> {
    validate_command(command)?;
    let encoded =
        serde_json::to_vec(&(command, payload)).map_err(|_| PracticeError::InvalidContract)?;
    Ok(hex::encode(Sha256::digest(encoded)))
}

pub fn check_command_revision(
    command: &CommandEnvelope,
    current_projection_version: u64,
    request_digest: &str,
    existing_receipt_digest: Option<&str>,
) -> Result<bool, PracticeError> {
    validate_command(command)?;
    if request_digest.len() != 64 || !request_digest.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(PracticeError::InvalidContract);
    }
    if let Some(previous) = existing_receipt_digest {
        return if previous == request_digest {
            Ok(false)
        } else {
            Err(PracticeError::IdempotencyConflict)
        };
    }
    if current_projection_version != command.expected_projection_version {
        return Err(PracticeError::StaleProjection);
    }
    Ok(true)
}

/// Reauthorise before using any cached source summary. Scrub fields by their source
/// permission, including counts and next actions that could otherwise disclose activity.
pub fn project_client_summary(
    snapshot: &AuthoritySnapshot,
    command: &CommandEnvelope,
    source: &ClientSummary,
    surface: AccessSurface,
    now: DateTime<Utc>,
) -> Result<ClientSummary, PracticeError> {
    if command.capability
        != (Capability {
            resource: Resource::ClientIndex,
            action: Action::Read,
        })
        || command.plan.as_ref() != Some(&source.plan)
    {
        return Err(PracticeError::Forbidden);
    }
    validate_summary(source)?;
    authorize(snapshot, command, surface, now)?;
    let can_read = |resource| {
        let mut request = command.clone();
        request.capability = Capability {
            resource,
            action: Action::Read,
        };
        authorize(snapshot, &request, surface, now).is_ok()
    };
    let mut result = source.clone();
    if !can_read(Resource::Conversation) {
        result.unread_count = None;
    }
    if !can_read(Resource::FinancialSummary) {
        result.financial_due.clear();
    }
    // A total across heterogeneous tasks can itself disclose hidden client activity.
    let all_action_sources_visible = [
        Resource::Conversation,
        Resource::Quotation,
        Resource::Hold,
        Resource::Tasks,
        Resource::FinancialEvidence,
        Resource::Collaboration,
    ]
    .into_iter()
    .all(can_read);
    if !all_action_sources_visible {
        result.action_needed_count = None;
    }
    let required = match result.next_action {
        Some(NextAction::ReviewPermission) => Resource::Collaboration,
        Some(
            NextAction::ReviewApproval | NextAction::ReviewResponse | NextAction::PrepareFollowUp,
        ) => Resource::Conversation,
        Some(NextAction::ReviewQuote) => Resource::Quotation,
        Some(NextAction::ReviewHold) => Resource::Hold,
        Some(NextAction::ReviewTask) => Resource::Tasks,
        Some(NextAction::ReviewPaymentEvidence) => Resource::FinancialEvidence,
        None => Resource::ClientIndex,
    };
    if !can_read(required)
        || (result.next_action == Some(NextAction::ReviewApproval) && !all_action_sources_visible)
    {
        result.next_action = None;
        result.next_action_due_at = None;
    }
    Ok(result)
}
