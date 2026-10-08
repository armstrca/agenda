use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(m, "events",
            &[
            
            ("id", ColType::PkUuid),
            
            ("title", ColType::String),
            ("description", ColType::TextNull),
            ("start_time", ColType::DateTime),
            ("end_time", ColType::DateTime),
            ("all_day", ColType::Boolean),
            ("timezone", ColType::StringNull),
            ("recurrence_rule", ColType::StringNull),
            ("recurrence_exceptions", ColType::JsonNull),
            ("recurrence_end", ColType::DateTimeNull),
            ("color", ColType::StringNull),
            ("is_exception", ColType::BooleanNull),
            ("original_start", ColType::DateTimeNull),
            ("status", ColType::StringNull),
            ("source", ColType::StringNull),
            ],
            &[
            ("planner", ""),
            ("user", ""),
            ]
        ).await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "events").await
    }
}
