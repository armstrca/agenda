use sea_orm::entity::prelude::*;
pub use super::_entities::planner_entries::{ActiveModel, Model, Entity};
pub type PlannerEntries = Entity;

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

        match &this.content {
            sea_orm::ActiveValue::Set(_) => {}
            _ => return Err(DbErr::Custom("content must be present".to_string())),
        }

        match &this.page_id {
            sea_orm::ActiveValue::Set(_) => {}
            _ => return Err(DbErr::Custom("page_id must be present".to_string())),
        }

        match &this.planner_id {
            sea_orm::ActiveValue::Set(_) => {}
            _ => return Err(DbErr::Custom("planner_id must be present".to_string())),
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

impl Entity {
    pub async fn for_date(db: &DatabaseConnection, date: chrono::NaiveDate) -> Result<Vec<Model>, DbErr> {
        use super::_entities::planner_entries::Column;
        Entity::find()
            .filter(Column::EntryDate.eq(date))
            .all(db)
            .await
    }

    pub async fn find_by_page_planner_and_date(
        db: &DatabaseConnection,
        page_id: i32,
        planner_id: i32,
        entry_date: chrono::NaiveDate,
    ) -> Result<Option<Model>, DbErr> {
        use super::_entities::planner_entries::Column;
        Entity::find()
            .filter(Column::PageId.eq(page_id))
            .filter(Column::PlannerId.eq(planner_id))
            .filter(Column::EntryDate.eq(entry_date))
            .one(db)
            .await
    }
}
