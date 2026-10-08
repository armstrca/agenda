#![allow(clippy::missing_errors_doc)]
#![allow(clippy::unnecessary_struct_initialization)]
#![allow(clippy::unused_async)]

use sea_orm::{DatabaseConnection, EntityTrait, ActiveModelTrait, Set};
use crate::models::_entities::planners::{Entity as PlannerEntity, ActiveModel as PlannerActiveModel};
use uuid::Uuid;
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};
use axum::debug_handler;

use crate::models::_entities::planners::{ActiveModel, Entity, Model};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Params {
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub user_id: String,
    }

impl Params {
    fn update(&self, item: &mut ActiveModel) {
      item.name = Set(self.name.clone().unwrap_or_default());
      item.description = Set(self.description.clone());
      item.user_id = Set(self.user_id.clone());
      }
}

async fn load_item(ctx: &AppContext, id: Uuid) -> Result<Model> {
    let item = Entity::find_by_id(id).one(&ctx.db).await?;
    item.ok_or_else(|| Error::NotFound)
}

#[debug_handler]
pub async fn list(State(ctx): State<AppContext>) -> Result<Response> {
    format::json(Entity::find().all(&ctx.db).await?)
}

#[debug_handler]
pub async fn add(State(ctx): State<AppContext>, Json(params): Json<Params>) -> Result<Response> {
    let mut item = ActiveModel {
        ..Default::default()
    };
    params.update(&mut item);
    let item = item.insert(&ctx.db).await?;
    format::json(item)
}

#[debug_handler]
pub async fn update(
    Path(id): Path<Uuid>,
    State(ctx): State<AppContext>,
    Json(params): Json<Params>,
) -> Result<Response> {
    let item = load_item(&ctx, id).await?;
    let mut item = item.into_active_model();
    params.update(&mut item);
    let item = item.update(&ctx.db).await?;
    format::json(item)
}

#[debug_handler]
pub async fn remove(Path(id): Path<Uuid>, State(ctx): State<AppContext>) -> Result<Response> {
    load_item(&ctx, id).await?.delete(&ctx.db).await?;
    format::empty()
}

#[debug_handler]
pub async fn get_one(Path(id): Path<Uuid>, State(ctx): State<AppContext>) -> Result<Response> {
    format::json(load_item(&ctx, id).await?)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/planners/")
        .add("/", get(list))
        .add("/", post(add))
        .add("{id}", get(get_one))
        .add("{id}", delete(remove))
        .add("{id}", put(update))
        .add("{id}", patch(update))
}

#[derive(Debug, serde::Deserialize)]
pub struct CreatePlannerPayload {
    pub name: String,
    pub description: Option<String>,
    pub planner_settings: serde_json::Value,
    pub user_id: Option<String>,
}

pub async fn get_planners(db: &DatabaseConnection) -> Result<serde_json::Value, String> {
    let items = PlannerEntity::find()
        .all(db)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(items).map_err(|e| e.to_string())
}

pub async fn get_planner(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    let id_str = payload
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "invalid or missing id".to_string())?;
    let id = Uuid::parse_str(id_str).map_err(|_| "invalid id format (expected UUID string)".to_string())?;
    let item = PlannerEntity::find_by_id(id)
        .one(db)
        .await
        .map_err(|e| e.to_string())?;
    serde_json::to_value(item).map_err(|e| e.to_string())
}

pub async fn create_planner(db: &DatabaseConnection, payload: &serde_json::Value) -> Result<serde_json::Value, String> {
    tracing::info!(payload = ?payload, "controllers::planners::create_planner called");
    let p: CreatePlannerPayload = serde_json::from_value(payload.clone()).map_err(|e| {
        let msg = format!("invalid create_planner payload: {}", e.to_string());
        tracing::error!(error = %msg, payload = ?payload);
        msg
    })?;
    tracing::debug!(name = %p.name, user_id = ?p.user_id, "create_planner payload parsed");
    // Resolve user_id: prefer provided value, otherwise fall back to first user in DB (dev convenience)
    let user_id = if let Some(uid) = p.user_id {
        Uuid::parse_str(&uid).map_err(|_| "invalid user_id (expected UUID)".to_string())?
    } else {
        // try to find any user in the database
        match crate::models::_entities::users::Entity::find().one(db).await.map_err(|e| e.to_string())? {
            Some(u) => Uuid::parse_str(&u.id).map_err(|_| "invalid user id in DB (expected UUID)".to_string())?,
            None => return Err("user_id is required and no users exist in the database".to_string()),
        }
    };
    let am = PlannerActiveModel {
        id: Set(Uuid::new_v4().to_string()),
        name: Set(p.name),
        description: Set(p.description),
        planner_settings: Set(p.planner_settings),
        user_id: Set(user_id.to_string()),
        ..Default::default()
    };
    let inserted = am.insert(db).await.map_err(|e| {
        let msg = format!("db insert error: {}", e.to_string());
        tracing::error!(error = %msg, user_id = %user_id.to_string());
        msg
    })?;
    serde_json::to_value(inserted).map_err(|e| {
        let msg = format!("serialize inserted planner error: {}", e.to_string());
        tracing::error!(error = %msg);
        msg
    })
}
