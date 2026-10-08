#![allow(clippy::missing_errors_doc)]
#![allow(clippy::unnecessary_struct_initialization)]
#![allow(clippy::unused_async)]
use loco_rs::prelude::*;
use serde::{Deserialize, Serialize};
use axum::debug_handler;
use axum::extract::Query;

use crate::models::_entities::planner_entries::{ActiveModel, Entity};
use crate::models::_entities::pages;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Params {
    pub page_id: Option<String>,
    pub planner_id: Option<String>,
    pub tiptap_id: Option<String>,
    pub entry_date: Option<Date>,
    pub content: Option<serde_json::Value>,
    pub entry_time: Option<DateTime>,
    pub updated_version: Option<i32>,
    pub user_id: String,
    }

// impl Params {
//     fn update(&self, item: &mut ActiveModel) {
//       item.page_id = Set(self.page_id.unwrap_or_default());
//       item.user_id = Set(self.user_id.unwrap_or_default());
//       item.planner_id = Set(self.planner_id.unwrap_or_default());
//       item.content = Set(self.content.clone());
//       item.entry_time = Set(self.entry_time);
//       item.updated_version = Set(self.updated_version);
//       item.tiptap_id = Set(self.tiptap_id.clone());
//       item.entry_date = Set(self.entry_date);
//       }
// }

#[debug_handler]
pub async fn list(State(ctx): State<AppContext>, Query(query): Query<Params>) -> Result<Response> {
    let page_id = match query.page_id {
        Some(id) => id,
        None => return Err(Error::BadRequest("Missing required parameter: page_id".into())),
    };

    let page = pages::Entity::find_by_id(page_id.clone()).one(&ctx.db).await?;
    if page.is_none() {
        return Err(Error::NotFound);
    }

    use crate::models::_entities::planner_entries::Column;
    let mut finder = Entity::find().filter(Column::PageId.eq(page_id));
    if let Some(id) = query.planner_id {
        finder = finder.filter(Column::PlannerId.eq(id));
    }
    if let Some(ref ttid) = query.tiptap_id {
        finder = finder.filter(Column::TiptapId.eq(ttid.as_str()));
    }
    let results = finder.all(&ctx.db).await?;
    format::json(results)
}

#[debug_handler]
pub async fn add(State(ctx): State<AppContext>, Json(params): Json<Params>) -> Result<Response> {
    let (page_id, planner_id, entry_date) = match (params.page_id, params.planner_id, params.entry_date) {
        (Some(pgid), Some(plid), Some(edate)) => (pgid, plid, edate),
        _ => return Err(Error::BadRequest("Missing required parameters".into())),
    };

    let page = pages::Entity::find_by_id(page_id.clone()).one(&ctx.db).await?;
    let page = match page {
        Some(p) => p,
        None => return Err(Error::NotFound),
    };

    use crate::models::_entities::planner_entries::Column;
    let existing = Entity::find()
        .filter(Column::PageId.eq(page_id.clone()))
        .filter(Column::PlannerId.eq(planner_id.clone()))
        .filter(Column::EntryDate.eq(entry_date))
        .one(&ctx.db)
        .await?;

    let mut model = if let Some(found) = existing {
        let mut am = found.into_active_model();
        let current = match am.updated_version.clone() {
            sea_orm::ActiveValue::Set(Some(v)) => v,
            sea_orm::ActiveValue::Unchanged(Some(v)) => v,
            _ => 0,
        };
        am.updated_version = Set(Some(current + 1));
        am
    } else {
        ActiveModel {
            page_id: Set(page_id),
            planner_id: Set(planner_id),
            entry_date: Set(entry_date),
            user_id: Set(page.user_id),
            updated_version: Set(Some(0)),
            ..Default::default()
        }
    };

    model.content = Set(params.content.clone().unwrap_or_default());
    if let Some(tt) = params.tiptap_id.clone() {
        model.tiptap_id = Set(Some(tt));
    }
    if let Some(et) = params.entry_time {
        model.entry_time = Set(et);
    }

    let saved = match model.id {
        sea_orm::ActiveValue::NotSet => model.insert(&ctx.db).await?,
        _ => model.update(&ctx.db).await?,
    };
    format::json(saved)
}

pub fn routes() -> Routes {
    Routes::new()
        .prefix("api/planner_entries/")
        .add("/", get(list))
        .add("/", post(add))
        // .add("{id}", get(get_one))
        // .add("{id}", delete(remove))
        // .add("{id}", put(update))
        // .add("{id}", patch(update))
}
