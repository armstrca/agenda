use sea_orm::entity::prelude::*;
pub use super::_entities::planners::{ActiveModel, Model, Entity};
pub type Planners = Entity;

#[async_trait::async_trait]
impl ActiveModelBehavior for ActiveModel {
    async fn before_save<C>(self, _db: &C, insert: bool) -> std::result::Result<Self, DbErr>
    where
        C: ConnectionTrait,
    {
        let mut this = self;

        match this.user_id {
            sea_orm::ActiveValue::Set(_) => {}
            _ => return Err(DbErr::Custom("user_id must be present".to_string())),
        }

        match &this.name {
            sea_orm::ActiveValue::Set(n) => {
                if n.trim().is_empty() {
                    return Err(DbErr::Custom("name must be present".to_string()));
                }
            }
            _ => return Err(DbErr::Custom("name must be present".to_string())),
        }

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
