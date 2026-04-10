# Investigation: Run Synchronization Failures

This document outlines the findings and proposed steps for resolving the issue where runs are not saving or appearing in the Admin/Calendar views.

## Key Findings

1.  **Deliveries Upsert Failure**: The `syncRouteToSupabase` function in `App.tsx` attempts an `upsert` on the `deliveries` table using `onConflict: 'address,delivery_date,user_id'`. However, there is no unique index on these columns in the database, causing the operation to fail.
2.  **Calendar Data Source**: `CalendarScreen.tsx` fetches data from the `deliveries` table. Because the upsert fails, no data is available for the calendar to display.
3.  **Broken Run Restoration**: `fetchRunState` in `App.tsx` queries `run_stops` using a `user_id` column that does not exist in that table, preventing the app from restoring previous runs on launch.
4.  **Admin View Disconnect**: The `admin_runs` and `admin_run_routes` tables are being updated, but they may be hidden by Row Level Security (RLS) policies if the viewer is not the run owner, or they may be failing due to Foreign Key constraints if the `admin_runs` upsert fails.

## Recommended Fixes

### 1. Database Schema Update
Add a unique constraint to the `deliveries` table to support the `upsert` logic:
```sql
ALTER TABLE deliveries ADD CONSTRAINT deliveries_unique_idx UNIQUE (address, delivery_date, user_id);
```

### 2. App.tsx Restoration Logic
Update `fetchRunState` to query the `admin_runs` and `admin_run_routes` tables instead of `run_stops`, as the latter is no longer compatible with the multi-user schema.

### 3. Error Visibility
Enhance `syncRouteToSupabase` with better error handling or a "Sync Status" indicator in the UI to ensure users are aware of synchronization failures.

## Reference Files
- [App.tsx](file:///c:/Users/joshs/OneDrive/Desktop/Apps/Robin/src/App.tsx) (Sync logic)
- [CalendarScreen.tsx](file:///c:/Users/joshs/OneDrive/Desktop/Apps/Robin/src/components/CalendarScreen.tsx) (Calendar fetching)
- [supabase_admin_runs_setup.sql](file:///c:/Users/joshs/OneDrive/Desktop/Apps/Robin/supabase_admin_runs_setup.sql) (Schema reference)
