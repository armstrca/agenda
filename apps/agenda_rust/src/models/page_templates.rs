pub use super::_entities::page_templates::{ActiveModel, Entity, Model};
use sea_orm::entity::prelude::*;
pub type PageTemplates = Entity;
use serde_json::Value as JsonValue;

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

        match &this.template_type {
            sea_orm::ActiveValue::Set(at) => {
                let allowed = [
                    "daily",
                    "weekly",
                    "monthly",
                    "custom",
                    "weekly_left",
                    "weekly_right",
                ];
                if !allowed.contains(&at.as_str()) {
                    return Err(DbErr::Custom(format!("invalid template_type: {}", at)));
                }
            }
            _ => {
                return Err(DbErr::Custom("template_type must be present".to_string()));
            }
        }

        if let sea_orm::ActiveValue::Set(json) = &this.content {
            if !matches!(json, JsonValue::Object(_)) {
                return Err(DbErr::Custom("invalid template structure: content must be a JSON object".to_string()));
            }
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
    pub async fn default_templates(db: &DatabaseConnection) -> Result<Vec<Model>, DbErr> {
        use super::_entities::page_templates::Column;
        Entity::find()
            .filter(Column::IsDefault.eq(true))
            .all(db)
            .await
    }

    pub async fn weekly_left(db: &DatabaseConnection) -> Result<Vec<Model>, DbErr> {
        use super::_entities::page_templates::Column;
        Entity::find()
            .filter(Column::TemplateType.eq("weekly_left"))
            .all(db)
            .await
    }
}
