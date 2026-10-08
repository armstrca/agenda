#![allow(clippy::missing_errors_doc)]
#![allow(clippy::unnecessary_struct_initialization)]
#![allow(clippy::unused_async)]
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};
use axum::debug_handler;

use crate::models::_entities::page_templates::{ActiveModel, Entity, Model};
use crate::models::page_templates as PageTemplatesModel;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Params {
    pub name: String,
    pub content: serde_json::Value,
    pub template_type: String,
    pub is_default: bool,
    pub user_id: String,
    pub planner_id: String,
    }

impl Params {
    fn update(&self, item: &mut ActiveModel) {
      item.name = Set(self.name.clone());
      item.content = Set(self.content.clone());
      item.template_type = Set(self.template_type.clone());
      item.is_default = Set(self.is_default);
      item.user_id = Set(self.user_id.clone());
      item.planner_id = Set(self.planner_id.clone());
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
        .prefix("api/page_templates/")
        .add("/", get(list))
        .add("/", post(add))
        .add("{id}", get(get_one))
        .add("{id}", delete(remove))
        .add("{id}", put(update))
        .add("{id}", patch(update))
        .add("defaults", get(default_templates))
        .add("weekly_left", get(weekly_left))
}

#[debug_handler]
pub async fn default_templates(State(ctx): State<AppContext>) -> Result<Response> {
    let items = PageTemplatesModel::Entity::default_templates(&ctx.db).await?;
    format::json(items)
}

#[debug_handler]
pub async fn weekly_left(State(ctx): State<AppContext>) -> Result<Response> {
    let items = PageTemplatesModel::Entity::weekly_left(&ctx.db).await?;
    format::json(items)
}
