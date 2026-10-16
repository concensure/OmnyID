//! Template-neutral quotation intelligence primitives.
//!
//! The module deliberately separates probabilistic extraction from trusted,
//! deterministic calculation. Extractors may propose values, but only
//! evidence-anchored, validated contracts enter the calculator or AFP ledger.

pub mod calculation;
pub mod category_registry;
pub mod comparison;
pub mod contracts;
pub mod normalisation;
pub mod validation;

pub use calculation::*;
pub use category_registry::*;
pub use comparison::*;
pub use contracts::*;
pub use normalisation::*;
pub use validation::*;
