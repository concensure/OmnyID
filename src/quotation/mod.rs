//! Template-neutral quotation intelligence primitives.
//!
//! The module deliberately separates probabilistic extraction from trusted,
//! deterministic calculation. Extractors may propose values, but only
//! evidence-anchored, validated contracts enter the calculator or AFP ledger.

pub mod afp;
pub mod calculation;
pub mod category_registry;
pub mod clarification;
pub mod closure;
pub mod closure_evidence;
pub mod comparison;
pub mod contracts;
pub mod decision;
pub mod extraction;
pub mod extraction_prompt;
pub mod features;
pub mod metrics;
pub mod normalisation;
pub mod replay;
pub mod response_capability;
pub mod review;
pub mod secure_link_response;
pub mod validation;
pub mod vendor_context;
pub mod vendor_response;
pub mod vendor_response_transport;
pub mod vendor_revision;

pub use afp::*;
pub use calculation::*;
pub use category_registry::*;
pub use clarification::*;
pub use closure::*;
pub use closure_evidence::*;
pub use comparison::*;
pub use contracts::*;
pub use decision::*;
pub use extraction::*;
pub use extraction_prompt::*;
pub use features::*;
pub use metrics::*;
pub use normalisation::*;
pub use replay::*;
pub use response_capability::*;
pub use review::*;
pub use secure_link_response::*;
pub use validation::*;
pub use vendor_context::*;
pub use vendor_response::*;
pub use vendor_response_transport::*;
pub use vendor_revision::*;
