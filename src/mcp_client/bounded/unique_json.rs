//! Reject duplicate result keys before they can be silently overwritten.
use serde::de::{self, Deserialize, Deserializer, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use std::fmt;
struct Unique(Value);
impl<'de> Deserialize<'de> for Unique {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        deserialize(d).map(Self)
    }
}
pub(super) fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Value, D::Error> {
    struct Strict;
    impl<'de> Visitor<'de> for Strict {
        type Value = Value;
        fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
            f.write_str("unique JSON")
        }
        fn visit_bool<E: de::Error>(self, v: bool) -> Result<Value, E> {
            Ok(Value::Bool(v))
        }
        fn visit_i64<E: de::Error>(self, v: i64) -> Result<Value, E> {
            Ok(v.into())
        }
        fn visit_u64<E: de::Error>(self, v: u64) -> Result<Value, E> {
            Ok(v.into())
        }
        fn visit_f64<E: de::Error>(self, v: f64) -> Result<Value, E> {
            Number::from_f64(v)
                .map(Value::Number)
                .ok_or_else(|| E::custom("invalid number"))
        }
        fn visit_str<E: de::Error>(self, v: &str) -> Result<Value, E> {
            Ok(v.into())
        }
        fn visit_string<E: de::Error>(self, v: String) -> Result<Value, E> {
            Ok(v.into())
        }
        fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
            Ok(Value::Null)
        }
        fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
            let mut values = Vec::new();
            while let Some(Unique(v)) = a.next_element()? {
                values.push(v);
            }
            Ok(Value::Array(values))
        }
        fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
            let mut values = Map::new();
            while let Some(k) = a.next_key::<String>()? {
                if values.contains_key(&k) {
                    return Err(de::Error::custom("duplicate key"));
                }
                let Unique(v) = a.next_value()?;
                values.insert(k, v);
            }
            Ok(Value::Object(values))
        }
    }
    d.deserialize_any(Strict)
}
