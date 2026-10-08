#![allow(elided_lifetimes_in_paths)]
#![allow(clippy::wildcard_imports)]
pub use sea_orm_migration::prelude::*;
mod m20220101_000001_create_users;

mod m20251004_035525_create_planners;
mod m20251004_040240_create_pages;
mod m20251004_041622_create_page_templates;
mod m20251004_041959_create_planner_entries;
mod m20251004_050014_create_tldraw_snapshots;
mod m20251022_002510_create_events;
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20220101_000001_create_users::Migration),
            Box::new(m20251004_035525_create_planners::Migration),
            Box::new(m20251004_040240_create_pages::Migration),
            Box::new(m20251004_041622_create_page_templates::Migration),
            Box::new(m20251004_041959_create_planner_entries::Migration),
            Box::new(m20251004_050014_create_tldraw_snapshots::Migration),
            Box::new(m20251022_002510_create_events::Migration),
            // inject-above (do not remove this comment)
        ]
    }
}