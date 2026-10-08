#![allow(clippy::missing_errors_doc)]
#![allow(clippy::unnecessary_struct_initialization)]
#![allow(clippy::unused_async)]
use axum::debug_handler;
use axum::extract::Query;
use loco_rs::prelude::*;
// use sea_orm::QuerySelect;
use serde::{Deserialize, Serialize};

use crate::models::_entities::pages;
use crate::models::_entities::tldraw_snapshots::{ActiveModel, Entity, Model};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Params {
    pub page_id: String,
    pub planner_id: String,
    // pub tldraw_snapshot: Option<TldrawPayload>,
    pub user_id: String,
    pub document_data: Option<serde_json::Value>,
    pub schema: Option<serde_json::Value>,
}

impl Params {
    fn update(&self, item: &mut ActiveModel) {
        item.page_id = Set(self.page_id.clone());
        item.user_id = Set(self.user_id.clone());
        item.planner_id = Set(self.planner_id.clone());
        item.document_data = Set(self.document_data.clone().unwrap_or_default());
        item.schema = Set(self.schema.clone());
    }
}

async fn load_item(ctx: &AppContext, id: Uuid) -> Result<Model> {
    let item = Entity::find_by_id(id).one(&ctx.db).await?;
    item.ok_or_else(|| Error::NotFound)
}

#[debug_handler]
pub async fn list(State(ctx): State<AppContext>, Query(query): Query<Params>) -> Result<Response> {
    let page_id = query.page_id;

    let page = pages::Entity::find_by_id(page_id.clone()).one(&ctx.db).await?;
    if page.is_none() {
        return Err(Error::NotFound);
    }

    use crate::models::_entities::tldraw_snapshots::Column;
    let results = Entity::find()
        .filter(Column::PageId.eq(page_id.clone()))
        .all(&ctx.db)
        .await?;
    format::json(results)
}

#[debug_handler]
pub async fn add(State(ctx): State<AppContext>, Json(params): Json<Params>) -> Result<Response> {
    let page_id = params.page_id;
    let planner_id = params.planner_id;

    let page = pages::Entity::find_by_id(page_id.clone()).one(&ctx.db).await?;
    let page = match page {
        Some(p) => p,
        None => return Err(Error::NotFound),
    };

    use crate::models::_entities::tldraw_snapshots::Column;
    let existing = Entity::find()
        .filter(Column::PageId.eq(page_id.clone()))
        .filter(Column::PlannerId.eq(planner_id.clone()))
        .filter(Column::UserId.eq(page.user_id.clone()))
        .one(&ctx.db)
        .await?;

    let mut model = if let Some(found) = existing {
        found.into_active_model()
    } else {
        ActiveModel {
            page_id: Set(page_id),
            planner_id: Set(planner_id),
            user_id: Set(page.user_id),
            ..Default::default()
        }
    };

    // Apply incoming document data and schema if provided
    model.document_data = Set(params.document_data.unwrap_or_default());
    model.schema = Set(params.schema);

    let _saved = match model.id {
        sea_orm::ActiveValue::NotSet => model.insert(&ctx.db).await?,
        _ => model.update(&ctx.db).await?,
    };

    #[derive(Serialize)]
    struct SaveMsg {
        message: &'static str,
    }
    format::json(SaveMsg {
        message: "Saved successfully",
    })
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
        .prefix("api/tldraw_snapshots/")
        .add("/", get(list))
        .add("/", post(add))
        .add("{id}", get(get_one))
        .add("{id}", delete(remove))
        .add("{id}", put(update))
        .add("{id}", patch(update))
}
