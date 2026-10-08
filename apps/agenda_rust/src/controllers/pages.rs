#![allow(clippy::missing_errors_doc)]
#![allow(clippy::unnecessary_struct_initialization)]
#![allow(clippy::unused_async)]
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};
use axum::debug_handler;

use crate::models::_entities::pages::{ActiveModel, Entity, Model};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Params {
    pub user_id: String,
    pub planner_id: String,
    pub page_template_id: String,
    pub page_date: Date,
    pub page_type: String,
    pub period_identifier: String,
    pub updated_version: Option<i32>,
    }

impl Params {
    fn update(&self, item: &mut ActiveModel) {
      item.user_id = Set(self.user_id.clone());
      item.planner_id = Set(self.planner_id.clone());
      item.page_template_id = Set(self.page_template_id.clone());
      item.page_date = Set(self.page_date);
      item.page_type = Set(self.page_type.clone());
      item.period_identifier = Set(self.period_identifier.clone());
      item.updated_version = Set(self.updated_version);
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
        .prefix("api/pages/")
        .add("/", get(list))
        .add("/", post(add))
        .add("{id}", get(get_one))
        .add("{id}", delete(remove))
        .add("{id}", put(update))
        .add("{id}", patch(update))
        .add("monthly/{planner_id}/{month_id}", get(monthly_view))
        .add("weekly/{planner_id}/{week_id}", get(weekly_view))
}

#[debug_handler]
pub async fn monthly_view(
    Path((planner_id, month_id)): Path<(String, String)>,
    State(ctx): State<AppContext>,
) -> Result<Response> {
    let data = crate::models::pages::Entity::find_or_build_monthly(&ctx.db, planner_id, &month_id).await?;
    format::json(data)
}

#[debug_handler]
pub async fn weekly_view(
    Path((planner_id, week_id)): Path<(String, String)>,
    State(ctx): State<AppContext>,
) -> Result<Response> {
    let data = crate::models::pages::Entity::find_or_build_weekly(&ctx.db, planner_id, &week_id).await?;
    format::json(data)
}
