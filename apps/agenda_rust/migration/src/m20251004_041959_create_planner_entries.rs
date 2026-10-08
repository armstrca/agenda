use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(m, "planner_entries",
            &[
            
            ("id", ColType::PkUuid),
            
            ("content", ColType::JsonBinary),
            ("entry_time", ColType::DateTime),
            ("updated_version", ColType::IntegerNull),
            ("tiptap_id", ColType::StringNull),
            ("entry_date", ColType::Date),
            ],
            &[
            ("page", ""),
            ("user", ""),
            ("planner", ""),
            ]
        ).await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "planner_entries").await
    }
}
