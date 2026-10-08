use loco_rs::schema::*;
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, m: &SchemaManager) -> Result<(), DbErr> {
        create_table(m, "tldraw_snapshots",
            &[
            
            ("id", ColType::PkUuid),
            
            ("document_data", ColType::JsonBinary),
            ("schema", ColType::JsonBinaryNull),
            ],
            &[
            ("page", ""),
            ("user", ""),
            ("planner", ""),
            ]
        ).await
    }

    async fn down(&self, m: &SchemaManager) -> Result<(), DbErr> {
        drop_table(m, "tldraw_snapshots").await
    }
}
