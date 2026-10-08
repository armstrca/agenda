use crate::models;
use crate::controllers::planners::{get_planners, get_planner, create_planner};
use sea_orm::{DatabaseConnection, EntityTrait, ColumnTrait, QueryFilter, IntoActiveModel};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use crate::models::users::RegisterParams;

#[derive(Debug, Deserialize)]
pub struct IncomingCommand {
    pub command: String,
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct OutgoingResponse {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

pub async fn handle_command_json(db: &DatabaseConnection, line: &str) -> OutgoingResponse {
    let parsed: Result<IncomingCommand, _> = serde_json::from_str(line);
    let mut ok = true;
    let mut data: Option<serde_json::Value> = None;
    let mut error: Option<String> = None;

    match parsed {
        Ok(cmd) => match cmd.command.as_str() {
            "get_planners" => match get_planners(db).await {
                Ok(v) => data = Some(v),
                Err(e) => {
                    ok = false;
                    error = Some(e);
                }
            },
            "get_planner" => match get_planner(db, &cmd.payload).await {
                Ok(v) => data = Some(v),
                Err(e) => {
                    ok = false;
                    error = Some(e);
                }
            },
            "pages_index" => match pages_index(db, &cmd.payload).await {
                Ok(v) => data = Some(v),
                Err(e) => {
                    ok = false;
                    error = Some(e);
                }
            },
            "planner_entries_index" => match planner_entries_index(db, &cmd.payload).await {
                Ok(v) => data = Some(v),
                Err(e) => { ok = false; error = Some(e); }
            },
            "planner_entries_create" => match planner_entries_create(db, &cmd.payload).await {
                Ok(v) => data = Some(v),
                Err(e) => { ok = false; error = Some(e); }
            },
            "get_tldraw_snapshots" => match get_tldraw_snapshots(db, &cmd.payload).await {
                Ok(v) => data = Some(v),
                Err(e) => { ok = false; error = Some(e); }
            },
            "create_tldraw_snapshot" => match create_tldraw_snapshot(db, &cmd.payload).await {
                Ok(v) => data = Some(v),
                Err(e) => { ok = false; error = Some(e); }
            },
            "create_planner" => {
                tracing::info!(payload = ?cmd.payload, "ipc: create_planner received");
                match create_planner(db, &cmd.payload).await {
                    Ok(v) => data = Some(v),
                    Err(e) => { ok = false; tracing::error!(error = %e, payload = ?cmd.payload, "ipc: create_planner failed"); error = Some(e); }
                }
            },
            "create_user" => match create_user(db, &cmd.payload).await {
                Ok(v) => data = Some(v),
                Err(e) => { ok = false; error = Some(e); }
            },
            other => {
                ok = false;
                error = Some(format!("unknown command: {}", other));
            }
        },
        Err(e) => {
            ok = false;
            error = Some(format!("invalid json: {}", e));
        }
    }

    OutgoingResponse { success: ok, error, data }
}



#[derive(Debug, Deserialize)]
struct PagesIndexPayload {
    planner_id: String,
    #[serde(default)]
    month_id: Option<String>,
    #[serde(default)]
    week_id: Option<String>,
    #[serde(rename = "pageType")]
    _page_type: Option<String>,
}

async fn pages_index(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let p: PagesIndexPayload = serde_json::from_value(payload.clone()).map_err(|e| e.to_string())?;
    let planner_id: Uuid = p
        .planner_id
        .parse()
        .map_err(|_| "invalid planner_id (expected UUID)".to_string())?;

    if let Some(month_id) = p.month_id {
        let res = crate::models::pages::Entity::find_or_build_monthly(db, planner_id.to_string(), &month_id)
            .await
            .map_err(|e| e.to_string())?;
        let out = serde_json::json!({
            "template": res.template,
            "plannerEntries": res.planner_entries,
            "tldraw_snapshots": res.tldraw_snapshots,
            "page_id": res.page_id,
            "planner_id": res.planner_id,
        });
        return Ok(out);
    }

    if let Some(week_id) = p.week_id {
        let res = crate::models::pages::Entity::find_or_build_weekly(db, planner_id.to_string(), &week_id)
            .await
            .map_err(|e| e.to_string())?;
        let out = serde_json::json!({
            "template": res.template,
            "plannerEntries": res.planner_entries,
            "tldraw_snapshots": res.tldraw_snapshots,
            "weekData": res.week_data,
            "page_id": res.page_id,
            "planner_id": res.planner_id,
        });
        return Ok(out);
    }

    Err("missing month_id or week_id".to_string())
}

#[derive(Debug, Deserialize)]
struct PlannerEntriesIndexPayload {
    page_id: String,
    #[serde(default)]
    planner_id: Option<String>,
    #[serde(default)]
    tiptap_id: Option<String>,
}

async fn planner_entries_index(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let p: PlannerEntriesIndexPayload = serde_json::from_value(payload.clone()).map_err(|e| e.to_string())?;
    let page_id = Uuid::parse_str(&p.page_id).map_err(|_| "invalid page_id (expected UUID)".to_string())?;
    let mut query = models::_entities::planner_entries::Entity::find()
        .filter(models::_entities::planner_entries::Column::PageId.eq(page_id));
    if let Some(pid) = &p.planner_id {
        if let Ok(uuid) = Uuid::parse_str(pid) {
            query = query.filter(models::_entities::planner_entries::Column::PlannerId.eq(uuid));
        }
    }
    if let Some(ttid) = &p.tiptap_id {
        query = query.filter(models::_entities::planner_entries::Column::TiptapId.eq(ttid.as_str()));
    }
    let results = query.all(db).await.map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "planner_entries": results }))
}

#[derive(Debug, Deserialize)]
struct PlannerEntriesCreatePayload {
    page_id: String,
    planner_id: String,
    content: Option<String>,
    tiptap_id: Option<String>,
    // ISO date string YYYY-MM-DD
    entry_date: Option<String>,
}

async fn planner_entries_create(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    use sea_orm::{ActiveModelTrait, Set, ColumnTrait, QueryFilter, EntityTrait};
    use models::_entities::planner_entries::{ActiveModel as PlannerEntryActiveModel, Entity as PlannerEntriesEntity, Column};
    let p: PlannerEntriesCreatePayload = serde_json::from_value(payload.clone()).map_err(|e| e.to_string())?;
    let page_id = Uuid::parse_str(&p.page_id).map_err(|_| "invalid page_id (expected UUID)".to_string())?;
    let planner_id = Uuid::parse_str(&p.planner_id).map_err(|_| "invalid planner_id (expected UUID)".to_string())?;
    // Parse entry_date if provided
    let entry_date = if let Some(ref s) = p.entry_date {
        chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| "invalid entry_date (expected YYYY-MM-DD)".to_string())?
    } else {
        // Fallback: use today's date to satisfy NOT NULL constraint
        chrono::Utc::now().naive_utc().date()
    };

    // For minimal parity we upsert by (page_id, planner_id, tiptap_id) if tiptap provided
    let mut existing_query = PlannerEntriesEntity::find()
        .filter(Column::PageId.eq(page_id))
        .filter(Column::PlannerId.eq(planner_id));
    if let Some(ref tt) = p.tiptap_id { existing_query = existing_query.filter(Column::TiptapId.eq(tt.as_str())); }
    let existing = existing_query.one(db).await.map_err(|e| e.to_string())?;

    let saved = if let Some(found) = existing {
        let mut am = found.into_active_model();
        am.content = Set(p.content.map(|c| serde_json::Value::String(c)).unwrap_or(serde_json::Value::String("".into())));
        am.update(db).await.map_err(|e| e.to_string())?
    } else {
        // Need the page to get user_id
        let page = models::_entities::pages::Entity::find_by_id(page_id).one(db).await.map_err(|e| e.to_string())?
            .ok_or_else(|| "page not found".to_string())?;
        let mut am = PlannerEntryActiveModel {
            page_id: Set(page_id.to_string()),
            planner_id: Set(planner_id.to_string()),
            user_id: Set(page.user_id),
            updated_version: Set(Some(0)),
            ..Default::default()
        };
        if let Some(ref tt) = p.tiptap_id { am.tiptap_id = Set(Some(tt.clone())); }
        // Set required fields
        am.id = Set(Uuid::new_v4().to_string());
        am.entry_date = Set(entry_date);
        // Optional entry_time: default to midnight
        am.entry_time = Set(chrono::NaiveDateTime::new(entry_date, chrono::NaiveTime::from_hms_opt(0,0,0).unwrap()));
        am.content = Set(p.content.map(|c| serde_json::Value::String(c)).unwrap_or(serde_json::Value::String("".into())));
        // Avoid relying on last_insert_id (UUID PK): exec + fetch by id
        let new_id = match &am.id { Set(id) => id.clone(), _ => Uuid::new_v4().to_string() };
        PlannerEntriesEntity::insert(am).exec(db).await.map_err(|e| e.to_string())?;
        PlannerEntriesEntity::find_by_id(new_id).one(db).await.map_err(|e| e.to_string())?
            .ok_or_else(|| "inserted planner_entry not found".to_string())?
    };

    Ok(serde_json::json!({ "planner_entry": saved }))
}

#[derive(Debug, Deserialize)]
struct TldrawSnapshotsGetPayload {
    page_id: String,
}

async fn get_tldraw_snapshots(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    use models::_entities::tldraw_snapshots::{Entity as TldrawEntity, Column as TCol};
    let p: TldrawSnapshotsGetPayload = serde_json::from_value(payload.clone()).map_err(|e| e.to_string())?;
    let page_id = Uuid::parse_str(&p.page_id).map_err(|_| "invalid page_id (expected UUID)".to_string())?;

    // Ensure page exists
    let page = models::_entities::pages::Entity::find_by_id(page_id).one(db).await.map_err(|e| e.to_string())?;
    if page.is_none() { return Err("Page not found".to_string()); }

    let snapshots = TldrawEntity::find()
        .filter(TCol::PageId.eq(page_id))
        .all(db)
        .await
        .map_err(|e| e.to_string())?;

    Ok(serde_json::to_value(snapshots).map_err(|e| e.to_string())?)
}

#[derive(Debug, Deserialize)]
struct TldrawSnapshotPayloadInner {
    #[serde(default)]
    document_data: serde_json::Value,
    #[serde(default)]
    schema: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct TldrawSnapshotsCreatePayload {
    page_id: String,
    planner_id: String,
    #[serde(default)]
    tldraw_snapshot: Option<TldrawSnapshotPayloadInner>,
}

async fn create_tldraw_snapshot(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    use sea_orm::{EntityTrait, ColumnTrait, QueryFilter, Set, ActiveModelTrait};
    use models::_entities::tldraw_snapshots::{ActiveModel as TSRActiveModel, Entity as TldrawEntity, Column as TCol};

    let p: TldrawSnapshotsCreatePayload = serde_json::from_value(payload.clone()).map_err(|e| e.to_string())?;
    let page_id = Uuid::parse_str(&p.page_id).map_err(|_| "invalid page_id (expected UUID)".to_string())?;
    let planner_id = Uuid::parse_str(&p.planner_id).map_err(|_| "invalid planner_id (expected UUID)".to_string())?;
    let snap = p.tldraw_snapshot.ok_or_else(|| "missing tldraw_snapshot".to_string())?;

    // Need the page to get user_id
    let page = models::_entities::pages::Entity::find_by_id(page_id).one(db).await.map_err(|e| e.to_string())?
        .ok_or_else(|| "Page not found".to_string())?;
    // clone the user_id so we can use it multiple times without moving out of `page`
    let user_id = page.user_id.clone();

    // Find existing snapshot by (page_id, planner_id, user_id)
    let existing = TldrawEntity::find()
        .filter(TCol::PageId.eq(page_id))
        .filter(TCol::PlannerId.eq(planner_id))
        .filter(TCol::UserId.eq(user_id.clone()))
        .one(db)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(found) = existing {
        let mut am = found.into_active_model();
        am.document_data = Set(snap.document_data);
        am.schema = Set(snap.schema);
        am.update(db).await.map_err(|e| e.to_string())?;
    } else {
        // insert with exec + fetch-by-id to avoid last_insert_id path
        let am = TSRActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            page_id: Set(page_id.to_string()),
            planner_id: Set(planner_id.to_string()),
            user_id: Set(user_id.clone()),
            document_data: Set(snap.document_data),
            schema: Set(snap.schema),
            ..Default::default()
        };
        let new_id = match &am.id { Set(id) => id.clone(), _ => Uuid::new_v4().to_string() };
        TldrawEntity::insert(am).exec(db).await.map_err(|e| e.to_string())?;
        // fetch ensure insert OK
        TldrawEntity::find_by_id(new_id).one(db).await.map_err(|e| e.to_string())?
            .ok_or_else(|| "inserted snapshot not found".to_string())?;
    }

    Ok(serde_json::json!({ "message": "Saved successfully" }))
}

#[derive(Debug, Deserialize)]
struct CreateUserPayload {
    name: String,
    email: String,
    password: String,
}

async fn create_user(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    // Reuse RegisterParams shape from models::users
    let p: CreateUserPayload = serde_json::from_value(payload.clone()).map_err(|e| e.to_string())?;

    let reg = RegisterParams {
        email: p.email.clone(),
        password: p.password.clone(),
        name: p.name.clone(),
    };

    let res = crate::models::users::Model::create_with_password(db, &reg).await.map_err(|e| e.to_string())?;

    // mark email verification sent similarly to register flow
    let user = res
        .into_active_model()
        .set_email_verification_sent(db)
        .await
        .map_err(|e| e.to_string())?;

    serde_json::to_value(user).map_err(|e| e.to_string())
}
