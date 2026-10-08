use chrono::{Datelike, NaiveDate};
use serde_json::{Map, Value};
pub fn holidays_between(
    start: NaiveDate,
    end: NaiveDate,
    planner_settings: Option<serde_json::Value>,
) -> Map<String, Value> {
    use py_holidays_rs::{get_holidays_by_country, CountryCode};

    let mut map = Map::new();

    // Determine countries to include. Default to US.
    let mut countries: Vec<CountryCode> = vec![CountryCode::US];

    // If planner_settings provides holiday_countries as an array of ISO codes, use them
    if let Some(js) = planner_settings {
        if let Some(arr) = js.get("holiday_countries").and_then(|v| v.as_array()) {
            let mut parsed: Vec<CountryCode> = vec![];
            for item in arr.iter() {
                if let Some(code) = item.as_str() {
                    // CountryCode implements Serde Deserialize from a string variant name (e.g., "US", "GB").
                    // We'll leverage that to parse the code. Unknown codes are ignored.
                    let upper = code.to_ascii_uppercase();
                    if let Ok(cc) = serde_json::from_str::<CountryCode>(&format!("\"{}\"", upper)) {
                        parsed.push(cc);
                    }
                }
            }
            if !parsed.is_empty() {
                countries = parsed;
            }
        }
    }

    // For each selected country, collect holidays across all subdivisions.
    for country in countries.into_iter() {
        if let Ok(sub_map) = get_holidays_by_country(country) {
            for (_subdivision, dates_map) in sub_map.into_iter() {
                for (date, name) in dates_map.into_iter() {
                    if date < start || date > end {
                        continue;
                    }
                    let key = date.to_string();
                    // Ensure array exists and deduplicate names per date
                    match map.entry(key) {
                        serde_json::map::Entry::Vacant(v) => {
                            v.insert(Value::Array(vec![Value::String(name)]));
                        }
                        serde_json::map::Entry::Occupied(mut o) => {
                            if let Value::Array(arr) = o.get_mut() {
                                // Deduplicate names
                                let exists = arr.iter().any(|v| v.as_str() == Some(name.as_str()));
                                if !exists {
                                    arr.push(Value::String(name));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    map
}

pub fn moon_phases(dates: &[NaiveDate]) -> Map<String, Value> {
    use suncalc::{moon_illumination, Timestamp};

    let mut map = Map::new();
    let mut prev_phase_name: Option<String> = None;

    for date in dates.iter() {
        let ts = chrono::NaiveDate::from_ymd_opt(date.year(), date.month(), date.day())
            .unwrap()
            .and_hms_opt(12, 0, 0)
            .unwrap();
        let millis = ts
            .and_local_timezone(chrono::Utc)
            .unwrap()
            .timestamp_millis();
        let illumination = moon_illumination(Timestamp(millis));

        let phase_name = if illumination.phase < 0.03 {
            "new"
        } else if illumination.phase < 0.20 {
            "waxing crescent"
        } else if illumination.phase < 0.30 {
            "first quarter"
        } else if illumination.phase < 0.47 {
            "waxing gibbous"
        } else if illumination.phase < 0.53 {
            "full"
        } else if illumination.phase < 0.70 {
            "waning gibbous"
        } else if illumination.phase < 0.85 {
            "last quarter"
        } else {
            "waning crescent"
        };

        if prev_phase_name.as_deref() != Some(phase_name) {
            let emoji = match phase_name {
                "new" => "🌑",
                "waxing crescent" => "🌒",
                "first quarter" => "🌓",
                "waxing gibbous" => "🌔",
                "full" => "🌕",
                "waning gibbous" => "🌖",
                "last quarter" => "🌗",
                "waning crescent" => "🌘",
                _ => "",
            };

            let mut o = Map::new();
            o.insert("emoji".to_string(), Value::String(emoji.to_string()));
            o.insert(
                "alt".to_string(),
                Value::String(format!("Moon phase: {}", emoji)),
            );
            o.insert(
                "aria_label".to_string(),
                Value::String(format!("Moon phase: {}", emoji)),
            );
            map.insert(date.to_string(), Value::Object(o));
        } else {
            let mut o = Map::new();
            o.insert("emoji".to_string(), Value::String("".to_string()));
            o.insert("alt".to_string(), Value::String("".to_string()));
            o.insert("aria_label".to_string(), Value::String("".to_string()));
            map.insert(date.to_string(), Value::Object(o));
        }

        prev_phase_name = Some(phase_name.to_string());
    }

    map
}
