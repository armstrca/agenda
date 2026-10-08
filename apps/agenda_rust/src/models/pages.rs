use sea_orm::entity::prelude::*;
pub use super::_entities::pages::{ActiveModel, Model, Entity};
pub type Pages = Entity;
use serde::Serialize;
use serde_json::Value as JsonValue;
// use crate::models::planners::Planners as PlannersEntity;
use crate::models::page_templates::PageTemplates as PageTemplatesEntity;
use crate::models::planner_entries::PlannerEntries as PlannerEntriesEntity;
use crate::models::tldraw_snapshots::TldrawSnapshots as TldrawSnapshotsEntity;

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(self, _db: &C, insert: bool) -> std::result::Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let mut this = self;
        if !insert && this.updated_at.is_unchanged() {
            this.updated_at = sea_orm::ActiveValue::Set(chrono::Utc::now().into());
        }
        Ok(this)
    }
}

// implement your read-oriented logic here
impl Model {}

// implement your write-oriented logic here
impl ActiveModel {}

// implement your custom finders, selectors oriented logic here
impl Entity {}

impl Model {
    /// Delegate to the page_template's page_type. This mirrors `delegate :page_type, to: :page_template, prefix: true` in Rails
    /// Note: this requires joining with the page_templates table; caller must perform the join or fetch the template separately.
    pub fn page_template_page_type(&self, page_template: &super::_entities::page_templates::Model) -> Option<String> {
        Some(page_template.template_type.clone())
    }
}

/// Struct returned by the monthly finder to mirror controller JSON shape (simplified)
#[derive(Debug, Serialize)]
pub struct MonthlyPageData {
    pub template: Option<JsonValue>,
    pub page_id: String,
    pub planner_id: String,
    pub planner_entries: serde_json::Map<String, serde_json::Value>,
    pub tldraw_snapshots: Vec<serde_json::Value>,
    pub month_data: serde_json::Value,
}

impl Entity {
    /// Find or build a monthly page given a planner id and `month_id` in the format MM_YYYY
    /// Returns MonthlyPageData similar to the Rails controller's response structure.
    pub async fn find_or_build_monthly(
        db: &DatabaseConnection,
        planner_id: String,
        month_id: &str,
    ) -> Result<MonthlyPageData, DbErr> {
    use super::_entities::pages::Column as PageColumn;

        // Parse month_id like "04_2025"
        let re = regex::Regex::new(r"^(\d{2})_(\d{4})$").unwrap();
        let caps = re.captures(month_id).ok_or_else(|| DbErr::Custom("invalid month_id format".to_string()))?;
        let month: u32 = caps.get(1).unwrap().as_str().parse().map_err(|_| DbErr::Custom("invalid month".to_string()))?;
        let year: i32 = caps.get(2).unwrap().as_str().parse().map_err(|_| DbErr::Custom("invalid year".to_string()))?;

        let start_date = chrono::NaiveDate::from_ymd_opt(year, month, 1)
            .ok_or_else(|| DbErr::Custom("invalid start date".to_string()))?;
        let end_date = {
            let next_month = if month == 12 { 1 } else { month + 1 };
            let next_year = if month == 12 { year + 1 } else { year };
            chrono::NaiveDate::from_ymd_opt(next_year, next_month, 1)
                .ok_or_else(|| DbErr::Custom("invalid next month".to_string()))?
                - chrono::Duration::days(1)
        };

        // Find planner
        let planner = crate::models::planners::Planners::find_by_id(planner_id.clone()).one(db).await?;
        let planner = planner.ok_or_else(|| DbErr::Custom("planner not found".to_string()))?;

        // Attempt to find existing monthly page
        let page = Entity::find()
            .filter(PageColumn::PlannerId.eq(planner_id.clone()))
            .filter(PageColumn::PageType.eq("monthly"))
            .filter(PageColumn::PeriodIdentifier.eq(month_id.to_string()))
            .one(db)
            .await?;

        let page = match page {
            Some(p) => p,
            None => {
                // find default template for monthly
                use super::_entities::page_templates::Column as TemplateColumn;
                let default_template = PageTemplatesEntity::find()
                    .filter(TemplateColumn::PlannerId.eq(planner_id.clone()))
                    .filter(TemplateColumn::TemplateType.eq("monthly"))
                    .filter(TemplateColumn::IsDefault.eq(true))
                    .one(db)
                    .await?;

                // require a default monthly template
                let default_template = default_template
                    .ok_or_else(|| DbErr::Custom("Default monthly template not found".to_string()))?;

                // create page active model
                let mut am: ActiveModel = Default::default();
                // id has no DB default; generate here
                am.id = sea_orm::ActiveValue::Set(Uuid::new_v4().to_string());
                am.user_id = sea_orm::ActiveValue::Set(planner.user_id.clone());
                am.planner_id = sea_orm::ActiveValue::Set(planner_id.clone());
                am.page_template_id = sea_orm::ActiveValue::Set(default_template.id.clone());
                am.page_date = sea_orm::ActiveValue::Set(start_date);
                am.page_type = sea_orm::ActiveValue::Set("monthly".to_string());
                am.period_identifier = sea_orm::ActiveValue::Set(month_id.to_string());

                // insert using raw execute to avoid last_insert_id unpack for UUID PKs
                let new_id = match &am.id {
                    sea_orm::ActiveValue::Set(id) => id.clone(),
                    _ => Uuid::new_v4().to_string(),
                };
                let page_date = match &am.page_date { sea_orm::ActiveValue::Set(d) => *d, _ => start_date };
                let page_type = match &am.page_type { sea_orm::ActiveValue::Set(s) => s.clone(), _ => "monthly".to_string() };
                let period_identifier = match &am.period_identifier { sea_orm::ActiveValue::Set(s) => s.clone(), _ => month_id.to_string() };
                let user_id = match &am.user_id { sea_orm::ActiveValue::Set(u) => u.clone(), _ => planner.user_id.clone() };
                let planner_id_v = match &am.planner_id { sea_orm::ActiveValue::Set(u) => u.clone(), _ => planner_id.clone() };
                let page_template_id = match &am.page_template_id { sea_orm::ActiveValue::Set(u) => u.clone(), _ => default_template.id.clone() };

                let sql = "INSERT INTO \"pages\" (\"id\", \"page_date\", \"page_type\", \"period_identifier\", \"user_id\", \"planner_id\", \"page_template_id\") VALUES (?, ?, ?, ?, ?, ?, ?)";
                let values = vec![
                    sea_orm::sea_query::Value::String(Some(Box::new(new_id.clone()))),
                    sea_orm::sea_query::Value::ChronoDate(Some(Box::new(page_date))),
                    sea_orm::sea_query::Value::String(Some(Box::new(page_type))),
                    sea_orm::sea_query::Value::String(Some(Box::new(period_identifier))),
                    sea_orm::sea_query::Value::String(Some(Box::new(user_id))),
                    sea_orm::sea_query::Value::String(Some(Box::new(planner_id_v))),
                    sea_orm::sea_query::Value::String(Some(Box::new(page_template_id))),
                ];
                let stmt = sea_orm::Statement::from_sql_and_values(sea_orm::DatabaseBackend::Sqlite, sql, values);
                db.execute(stmt).await?;
                super::_entities::pages::Entity::find_by_id(new_id)
                    .one(db)
                    .await?
                    .ok_or_else(|| DbErr::Custom("inserted page not found".to_string()))?
            }
        };

        // Fetch entries for the range
        use super::_entities::planner_entries::Column as EntryColumn;
        let entries = PlannerEntriesEntity::find()
            .filter(EntryColumn::PageId.eq(page.id.clone()))
            .filter(EntryColumn::EntryDate.gte(start_date))
            .filter(EntryColumn::EntryDate.lte(end_date))
            .all(db)
            .await?;

        // Group entries by ISO date string
        let mut grouped: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        for e in entries.iter() {
            let key = e.entry_date.to_string();
            let arr = grouped.entry(key.clone()).or_insert_with(|| serde_json::Value::Array(vec![]));
            if let serde_json::Value::Array(ref mut v) = arr {
                v.push(serde_json::json!({"id": e.id, "content": e.content, "entry_date": e.entry_date, "updated_at": e.updated_at}));
            }
        }

        // Fetch tldraw snapshots
        use super::_entities::tldraw_snapshots::Column as SnapshotColumn;
        let snapshots = TldrawSnapshotsEntity::find()
            .filter(SnapshotColumn::PageId.eq(page.id.clone()))
            .all(db)
            .await?;

        let tldraw_json: Vec<serde_json::Value> = snapshots
            .into_iter()
            .map(|s| serde_json::json!({"id": s.id, "document_data": s.document_data, "schema": s.schema, "updated_at": s.updated_at}))
            .collect();

        // Prepare month data using calendar utilities
        let mut days_dates: Vec<chrono::NaiveDate> = Vec::new();
        let mut curd = start_date;
        while curd <= end_date {
            days_dates.push(curd);
            curd = curd + chrono::Duration::days(1);
        }

    let holidays_map = crate::tasks::calendar::holidays_between(start_date, end_date, Some(planner.planner_settings.clone()));
        let moon_map = crate::tasks::calendar::moon_phases(&days_dates);
        let day_strings: Vec<String> = days_dates.iter().map(|d| d.to_string()).collect();

        // In the monthly view, the frontend expects holidays map of date -> [names]
        // which we already compute as holidays_map. Keep full map here for calendar widgets.
        let month_data = serde_json::json!({
            "month": month,
            "year": year,
            "holidays": holidays_map,
            "moonPhases": moon_map,
            "days": day_strings
        });

        // Template JSON: load the page_template if present, wrap in object with `content` key to match frontend expectation
        let template_json = match PageTemplatesEntity::find_by_id(page.page_template_id).one(db).await {
            Ok(Some(tpl)) => Some(serde_json::json!({
                "id": tpl.id,
                "name": tpl.name,
                "template_type": tpl.template_type,
                "is_default": tpl.is_default,
                "user_id": tpl.user_id,
                "planner_id": tpl.planner_id,
                "content": tpl.content
            })),
            _ => None,
        };

        Ok(MonthlyPageData {
            template: template_json,
            page_id: page.id.clone(),
            planner_id: planner_id,
            planner_entries: grouped,
            tldraw_snapshots: tldraw_json,
            month_data,
        })
    }
}

/// Struct returned by the weekly finder to mirror controller JSON shape (simplified)
#[derive(Debug, Serialize)]
pub struct WeeklyPageData {
    pub template: Option<JsonValue>,
    pub page_id: String,
    pub planner_id: String,
    pub planner_entries: serde_json::Map<String, serde_json::Value>,
    pub tldraw_snapshots: Vec<serde_json::Value>,
    pub week_data: serde_json::Value,
}

impl Entity {
    /// Find or build a weekly page given a planner id and `week_id` expected in the format: W_YYYY_[l|r]
    /// where W is week number (1-53) and trailing `l` or `r` indicates left/right template side.
    pub async fn find_or_build_weekly(
        db: &DatabaseConnection,
        planner_id: String,
        week_id: &str,
    ) -> Result<WeeklyPageData, DbErr> {
        use chrono::{Datelike, Weekday};
        use super::_entities::pages::Column as PageColumn;

        // Parse week_id like "12_2025_l" or "1_2025_r"
        let re = regex::Regex::new(r"^(\d{1,2})_(\d{4})_([lr])$").unwrap();
        let caps = re.captures(week_id).ok_or_else(|| DbErr::Custom("invalid week_id format".to_string()))?;
        let week_number_raw: u32 = caps.get(1).unwrap().as_str().parse().map_err(|_| DbErr::Custom("invalid week number".to_string()))?;
        let year_raw: i32 = caps.get(2).unwrap().as_str().parse().map_err(|_| DbErr::Custom("invalid year".to_string()))?;
        let side = caps.get(3).unwrap().as_str();

        // Normalize week/year to a valid ISO week. If an invalid week (e.g., 53 in a 52-week year)
        // is requested, roll over to week 1 of the next year. If week 0 is requested, roll back
        // to the last ISO week of the previous year.
        let iso_weeks_in_year = |yr: i32| -> u32 {
            chrono::NaiveDate::from_ymd_opt(yr, 12, 28)
                .unwrap()
                .iso_week()
                .week()
        };
        let mut week_number = week_number_raw;
        let mut year = year_raw;
        let mut weeks_this_year = iso_weeks_in_year(year);
        if week_number < 1 {
            year -= 1;
            week_number = iso_weeks_in_year(year);
            weeks_this_year = iso_weeks_in_year(year);
        } else if week_number > weeks_this_year {
            year += 1;
            week_number = 1;
            weeks_this_year = iso_weeks_in_year(year);
        }
        let normalized_week_id = format!("{}_{}_{}", week_number, year, side);

        // Fetch planner
        let planner = crate::models::planners::Planners::find_by_id(planner_id.clone()).one(db).await?;
        let planner = planner.ok_or_else(|| DbErr::Custom("planner not found".to_string()))?;

        // Read week-start-day from planner.planner_settings when available, default to Mon
        let week_start_day = planner.planner_settings
            .get("metadata")
            .and_then(|m| m.get("default_styles"))
            .and_then(|ds| ds.get("week-start-day"))
            .and_then(|v| v.as_str())
            .unwrap_or("Mon");

        // Map abbreviated day names to chrono Weekday
        let start_weekday = match week_start_day {
            "Sun" => Weekday::Sun,
            "Mon" => Weekday::Mon,
            "Tue" => Weekday::Tue,
            "Wed" => Weekday::Wed,
            "Thu" => Weekday::Thu,
            "Fri" => Weekday::Fri,
            "Sat" => Weekday::Sat,
            _ => Weekday::Mon,
        };

        // Compute start_date using ISO week -> there is no direct Chrono commercial week-start mapping with a custom start day,
        // but Rails used Date.commercial(year, week_number, start_day_index). We'll approximate by using ISO week start (Mon)
        // and then shift to desired weekday.
        let iso_start = chrono::NaiveDate::from_isoywd_opt(year, week_number, chrono::Weekday::Mon)
            .ok_or_else(|| DbErr::Custom("invalid iso week date".to_string()))?;

        // Shift iso_start to desired weekday
        let mut start_date = iso_start;
        while start_date.weekday() != start_weekday {
            start_date = start_date - chrono::Duration::days(1);
        }
        let end_date = start_date + chrono::Duration::days(6);

        // Try to find existing weekly page
        let page = Entity::find()
            .filter(PageColumn::PlannerId.eq(planner_id.clone()))
            .filter(PageColumn::PageType.eq("weekly"))
            .filter(PageColumn::PeriodIdentifier.eq(normalized_week_id.clone()))
            .one(db)
            .await?;

        let page = match page {
            Some(p) => p,
            None => {
                // choose template side
                let template_type = if side == "l" { "weekly_left" } else { "weekly_right" };
                use super::_entities::page_templates::Column as TemplateColumn;
                let default_template = PageTemplatesEntity::find()
                    .filter(TemplateColumn::PlannerId.eq(planner_id.clone()))
                    .filter(TemplateColumn::TemplateType.eq(template_type))
                    .filter(TemplateColumn::IsDefault.eq(true))
                    .one(db)
                    .await?;

                let default_template = default_template.ok_or_else(|| DbErr::Custom("Default template not found".to_string()))?;

                // build ActiveModel
                let mut am: ActiveModel = Default::default();
                // id has no DB default; generate here
                am.id = sea_orm::ActiveValue::Set(Uuid::new_v4().to_string());
                am.user_id = sea_orm::ActiveValue::Set(planner.user_id.clone());
                am.planner_id = sea_orm::ActiveValue::Set(planner_id.clone());
                am.page_template_id = sea_orm::ActiveValue::Set(default_template.id.clone());
                am.page_date = sea_orm::ActiveValue::Set(start_date);
                am.page_type = sea_orm::ActiveValue::Set("weekly".to_string());
                am.period_identifier = sea_orm::ActiveValue::Set(normalized_week_id.clone());

                // insert using raw execute to avoid last_insert_id unpack for UUID PKs
                let new_id = match &am.id {
                    sea_orm::ActiveValue::Set(id) => id.clone(),
                    _ => Uuid::new_v4().to_string(),
                };
                let page_date = match &am.page_date { sea_orm::ActiveValue::Set(d) => *d, _ => start_date };
                let page_type = match &am.page_type { sea_orm::ActiveValue::Set(s) => s.clone(), _ => "weekly".to_string() };
                let period_identifier = match &am.period_identifier { sea_orm::ActiveValue::Set(s) => s.clone(), _ => week_id.to_string() };
                let user_id = match &am.user_id { sea_orm::ActiveValue::Set(u) => u.clone(), _ => planner.user_id.clone() };
                let planner_id_v = match &am.planner_id { sea_orm::ActiveValue::Set(u) => u.clone(), _ => planner_id.clone() };
                let page_template_id = match &am.page_template_id { sea_orm::ActiveValue::Set(u) => u.clone(), _ => default_template.id.clone() };

                let sql = "INSERT INTO \"pages\" (\"id\", \"page_date\", \"page_type\", \"period_identifier\", \"user_id\", \"planner_id\", \"page_template_id\") VALUES (?, ?, ?, ?, ?, ?, ?)";
                let values = vec![
                    sea_orm::sea_query::Value::String(Some(Box::new(new_id.clone()))),
                    sea_orm::sea_query::Value::ChronoDate(Some(Box::new(page_date))),
                    sea_orm::sea_query::Value::String(Some(Box::new(page_type))),
                    sea_orm::sea_query::Value::String(Some(Box::new(period_identifier))),
                    sea_orm::sea_query::Value::String(Some(Box::new(user_id))),
                    sea_orm::sea_query::Value::String(Some(Box::new(planner_id_v))),
                    sea_orm::sea_query::Value::String(Some(Box::new(page_template_id))),
                ];
                let stmt = sea_orm::Statement::from_sql_and_values(sea_orm::DatabaseBackend::Sqlite, sql, values);
                db.execute(stmt).await?;
                super::_entities::pages::Entity::find_by_id(new_id)
                    .one(db)
                    .await?
                    .ok_or_else(|| DbErr::Custom("inserted page not found".to_string()))?
            }
        };

        // Fetch entries in range
        use super::_entities::planner_entries::Column as EntryColumn;
        let entries = PlannerEntriesEntity::find()
            .filter(EntryColumn::PageId.eq(page.id.clone()))
            .filter(EntryColumn::EntryDate.gte(start_date))
            .filter(EntryColumn::EntryDate.lte(end_date))
            .all(db)
            .await?;

        let mut grouped: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
        for e in entries.iter() {
            let key = e.entry_date.to_string();
            let arr = grouped.entry(key.clone()).or_insert_with(|| serde_json::Value::Array(vec![]));
            if let serde_json::Value::Array(ref mut v) = arr {
                v.push(serde_json::json!({"id": e.id, "content": e.content, "entry_date": e.entry_date, "updated_at": e.updated_at}));
            }
        }

        // snapshots
        use super::_entities::tldraw_snapshots::Column as SnapshotColumn;
        let snapshots = TldrawSnapshotsEntity::find()
            .filter(SnapshotColumn::PageId.eq(page.id.clone()))
            .all(db)
            .await?;

        let tldraw_json: Vec<serde_json::Value> = snapshots
            .into_iter()
            .map(|s| serde_json::json!({"id": s.id, "document_data": s.document_data, "schema": s.schema, "updated_at": s.updated_at}))
            .collect();

        // compute days list
        let mut days_dates: Vec<chrono::NaiveDate> = Vec::new();
        let mut cur = start_date;
        while cur <= end_date {
            days_dates.push(cur);
            cur = cur + chrono::Duration::days(1);
        }

    let week_holidays = crate::tasks::calendar::holidays_between(start_date, end_date, Some(planner.planner_settings.clone()));
        let week_moon = crate::tasks::calendar::moon_phases(&days_dates);

        // Flattened structure matching legacy Rails/Go responses expected by frontend
        let main_dates: Vec<String> = days_dates.iter().map(|d| d.to_string()).collect();

        // Build templateData (first 6 days) and lastDayData (7th) mirroring frontend assumptions
        let template_data: Vec<serde_json::Value> = main_dates.iter().take(6).map(|d| {
            let nd = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok();
            let day_number = nd.map(|n| n.day()).unwrap_or(0);
            let month_year = nd.map(|n| n.format("%B %Y").to_string()).unwrap_or_default();
            let day_name = nd.map(|n| n.format("%A").to_string()).unwrap_or_default();
            // holidays_between returns a map of date -> ["Holiday A", "Holiday B", ...]
            // Ensure we emit a flat array of strings (not an array containing an array)
            let holidays: Vec<String> = week_holidays
                .get(d)
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            serde_json::json!({
                "entryDate": d,
                "day_number": day_number,
                "day_name": day_name,
                "holidays": holidays,
                "moon_phase": week_moon.get(d).and_then(|m| m.get("emoji")).and_then(|e| e.as_str()).unwrap_or("") ,
                "month_year": month_year
            })
        }).collect();

        let last_day_data = main_dates.get(6).map(|d| {
            let nd = chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d").ok();
            let day_number = nd.map(|n| n.day()).unwrap_or(0);
            let month_year = nd.map(|n| n.format("%B %Y").to_string()).unwrap_or_default();
            let day_name = nd.map(|n| n.format("%A").to_string()).unwrap_or_default();
            let holidays: Vec<String> = week_holidays
                .get(d)
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|x| x.as_str().map(|s| s.to_string()))
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            serde_json::json!({
                "entryDate": d,
                "day_number": day_number,
                "day_name": day_name,
                "holidays": holidays,
                "moon_phase": week_moon.get(d).and_then(|m| m.get("emoji")).and_then(|e| e.as_str()).unwrap_or("") ,
                "month_year": month_year
            })
        }).unwrap_or(serde_json::json!({}));

        // --- Additional weekly metadata & mini calendars for WeeklyRight ---
        // daysOrder based on planner's week start day (e.g., ["M","T","W","T","F","S","S"]).
        fn build_days_order(start: chrono::Weekday) -> Vec<String> {
            use chrono::Weekday::*;
            let order = [Mon, Tue, Wed, Thu, Fri, Sat, Sun];
            let start_idx = start.num_days_from_monday() as usize;
            let mut v: Vec<String> = Vec::with_capacity(7);
            for i in 0..7 {
                let wd = order[(start_idx + i) % 7];
                let ch = match wd {
                    Mon => "M",
                    Tue => "T",
                    Wed => "W",
                    Thu => "T",
                    Fri => "F",
                    Sat => "S",
                    Sun => "S",
                };
                v.push(ch.to_string());
            }
            v
        }

        // Build compact month calendar data used by the right page template.
        fn calendar_month_data(ref_date: chrono::NaiveDate, week_start: chrono::Weekday) -> serde_json::Value {
            use chrono::Datelike;
            let year = ref_date.year();
            let month = ref_date.month();
            let first_of_month = chrono::NaiveDate::from_ymd_opt(year, month, 1).unwrap();
            let (next_y, next_m) = if month == 12 { (year + 1, 1) } else { (year, month + 1) };
            let next_first = chrono::NaiveDate::from_ymd_opt(next_y, next_m, 1).unwrap();
            let last_of_month = next_first - chrono::Duration::days(1);
            let last_day = last_of_month.day();

            // Offset from week_start for the first day
            let first_wd = first_of_month.weekday();
            let first_i = first_wd.num_days_from_monday() as i32;
            let start_i = week_start.num_days_from_monday() as i32;
            let offset = ((first_i - start_i + 7) % 7) as usize;

            // Fill 6x7=42 cells with leading/trailing blanks (0) and day numbers
            let mut buttons: serde_json::Map<String, serde_json::Value> = serde_json::Map::new();
            let mut pos: usize = 1;
            for _ in 0..offset {
                buttons.insert(pos.to_string(), serde_json::json!(0));
                pos += 1;
            }
            for day in 1..=last_day {
                buttons.insert(pos.to_string(), serde_json::json!(day));
                pos += 1;
            }
            while pos <= 42 {
                buttons.insert(pos.to_string(), serde_json::json!(0));
                pos += 1;
            }

            let month_label = first_of_month.format("%B %Y").to_string();
            serde_json::json!({
                "month": month_label,
                "buttonData": buttons
            })
        }

    let days_order = build_days_order(start_weekday);
        // --- Compute robust prev/next week ids with ISO week rollover ---
        let iso_weeks_in_year = |yr: i32| -> u32 {
            // 28 Dec is always in the last ISO week of the year
            chrono::NaiveDate::from_ymd_opt(yr, 12, 28)
                .unwrap()
                .iso_week()
                .week()
        };
        // Reuse weeks_this_year from normalization above
        let next_week_id = if side == "l" {
            format!("{}_{}_r", week_number, year)
        } else {
            if week_number < weeks_this_year { format!("{}_{}_l", week_number + 1, year) } else { format!("1_{}_l", year + 1) }
        };
        let prev_week_id = if side == "r" {
            format!("{}_{}_l", week_number, year)
        } else {
            if week_number > 1 {
                format!("{}_{}_r", week_number - 1, year)
            } else {
                let py = year - 1;
                let last_prev = iso_weeks_in_year(py);
                format!("{}_{}_r", last_prev, py)
            }
        };
        let week_start_str = start_date.to_string();
        let current_month_name = end_date.format("%B").to_string();

        let left_calendar = calendar_month_data(end_date, start_weekday);
        let first_of_next_month = if end_date.month() == 12 {
            chrono::NaiveDate::from_ymd_opt(end_date.year() + 1, 1, 1).unwrap()
        } else {
            chrono::NaiveDate::from_ymd_opt(end_date.year(), end_date.month() + 1, 1).unwrap()
        };
        let right_calendar = calendar_month_data(first_of_next_month, start_weekday);

        let week_data = serde_json::json!({
            "weekNumber": week_number,
            "year": year,
            "side": side,
            "mainDates": main_dates,
            "endDate": end_date.to_string(),
            "holidays": week_holidays,
            "moonPhases": week_moon,
            "templateData": template_data,
            "lastDayData": last_day_data,
            // New fields for WeeklyRight calendars & header
            "weekStart": week_start_str,
            "currentMonthName": current_month_name,
            "daysOrder": days_order,
            "leftCalendar": left_calendar,
            "rightCalendar": right_calendar,
            // Navigation helpers to avoid year rollover bugs
            "weeksInYear": weeks_this_year,
            "nextWeekId": next_week_id,
            "prevWeekId": prev_week_id
        });

        // template JSON: wrap as object with content property
        let template_json = match PageTemplatesEntity::find_by_id(page.page_template_id).one(db).await {
            Ok(Some(tpl)) => Some(serde_json::json!({
                "id": tpl.id,
                "name": tpl.name,
                "template_type": tpl.template_type,
                "is_default": tpl.is_default,
                "user_id": tpl.user_id,
                "planner_id": tpl.planner_id,
                "content": tpl.content
            })),
            _ => None,
        };

        Ok(WeeklyPageData {
            template: template_json,
            page_id: page.id.to_string(),
            planner_id: planner_id.to_string(),
            planner_entries: grouped,
            tldraw_snapshots: tldraw_json,
            week_data,
        })
    }
}
