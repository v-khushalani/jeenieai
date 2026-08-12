-- Create log levels
create type public.log_level as enum ('info', 'warning', 'error', 'critical');

-- Create system_logs table
create table public.system_logs (
    id uuid primary key default gen_random_uuid(),
    created_at timestamptz default now(),
    level log_level not null default 'info',
    category text not null, -- 'frontend', 'backend', 'auth', 'database', etc.
    message text not null,
    metadata jsonb default '{}'::jsonb,
    user_id uuid references auth.users(id) on delete set null,
    route text,
    user_agent text
);

-- Grant access to system_logs
grant insert on public.system_logs to authenticated;
grant select on public.system_logs to authenticated; -- Admins will filter by role
grant all on public.system_logs to service_role;

-- Enable RLS
alter table public.system_logs enable row level security;

-- Policy: Admins can see all logs, users can insert (for frontend errors)
create policy "Admins can view all logs"
on public.system_logs
for select
to authenticated
using (public.has_role(auth.uid(), 'admin'));

create policy "Authenticated users can insert logs"
on public.system_logs
for insert
to authenticated
with check (true);

-- Function to get system health summary
create or replace function public.get_system_health_status()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    error_count int;
    last_migration text;
    database_size text;
begin
    select count(*) into error_count from public.system_logs where level in ('error', 'critical') and created_at > now() - interval '24 hours';
    
    -- In a real env we might check pg_stat_activity etc, but for now just basic stats
    return jsonb_build_object(
        'status', case when error_count > 10 then 'degraded' else 'healthy' end,
        'recent_errors_24h', error_count,
        'timestamp', now()
    );
end;
$$;

grant execute on function public.get_system_health_status() to authenticated;

