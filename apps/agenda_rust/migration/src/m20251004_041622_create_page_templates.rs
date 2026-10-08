use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(m, "page_templates",
            &[
            
            ("id", ColType::PkUuid),
            
            ("name", ColType::String),
            ("content", ColType::JsonBinary),
            ("template_type", ColType::String),
            ("is_default", ColType::Boolean),
            ],
            &[
            ("user", ""),
            ("planner", ""),
            ]
        ).await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "page_templates").await
    }
}
