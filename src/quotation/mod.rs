//! Template-neutral quotation intelligence primitives.
//!
//! The module deliberately separates probabilistic extraction from trusted,
//! deterministic calculation. Extractors may propose values, but only
//! evidence-anchored, validated contracts enter the calculator or AFP ledger.

pub mod category_registry;
pub mod contracts;
pub mod validation;

pub use category_registry::*;
pub use contracts::*;
pub use validation::*;
