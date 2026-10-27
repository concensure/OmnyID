//! Dark, template-neutral contracts. No route grants access through this module yet.
//! Authority snapshots must come from current server ledger replay, never request JSON.
mod authority;
mod bootstrap;
mod contracts;
mod events;
mod validation;

pub use authority::*;
pub use bootstrap::*;
pub use contracts::*;
pub use events::*;
pub use validation::*;

#[cfg(test)]
mod event_tests;
#[cfg(test)]
mod bootstrap_tests;
#[cfg(test)]
mod tests;
