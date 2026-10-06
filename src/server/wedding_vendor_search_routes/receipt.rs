// @locs-version: 1.0
use serde_json::Value;

pub(super) fn merge_receipt(mut base: Value, extra: Value) -> Value {
    if let (Some(base), Value::Object(extra)) = (base.as_object_mut(), extra) {
        base.extend(extra);
    }
    base
}
