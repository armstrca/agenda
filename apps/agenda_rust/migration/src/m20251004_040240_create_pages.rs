use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(m, "pages",
            &[
            
            ("id", ColType::PkUuid),
            
            ("page_date", ColType::Date),
            ("page_type", ColType::String),
            ("period_identifier", ColType::String),
            ("updated_version", ColType::IntegerNull),
            ],
            &[
            ("user", ""),
            ("planner", ""),
            ("page_template", ""),
            ]
        ).await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "pages").await
    }
}
