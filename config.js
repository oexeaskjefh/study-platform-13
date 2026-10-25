tailwind.config = {
            theme: {
                extend: {
                    fontFamily: {
                        cairo: ['Cairo', 'sans-serif'],
                    },
                    colors: {
                        primary: {
                            50: '#f0f9ff',
                            100: '#e0f2fe',
                            300: '#7dd3fc',
                            400: '#38bdf8',
                            500: '#0ea5e9',
                            600: '#0284c7',
                            700: '#0369a1',
                            800: '#075985',
                        },
                        accent: {
                            500: '#14b8a6',
                            600: '#0d9488',
                        }
                    }
                }
            }
        }

        /* ===== إعداد Supabase (مرة واحدة) =====
1) أنشئ مشروعاً مجانياً على supabase.com، ثم من SQL Editor نفّذ:
create table posts (id bigint generated always as identity primary key, title text not null, author text, field text, subject text, description text, type text, file_url text, file_name text, created_at timestamptz default now());
alter table posts enable row level security;
create policy "read" on posts for select using (true);
create policy "add" on posts for insert with check (true);
insert into storage.buckets (id, name, public) values ('files','files',true);
create policy "upload" on storage.objects for insert with check (bucket_id = 'files');
2) من Settings > API انسخ Project URL و anon key والصقهما هنا: */
        const SUPABASE_URL = 'https://hplrmnvgtzuusnghjbis.supabase.co';
        const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhwbHJtbnZndHp1dXNuZ2hqYmlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NDU5NzYsImV4cCI6MjEwODQyMTk3Nn0.c0cEouNcelvDvpZkqNMbXpbv6tqBGqC1JKFgVzNej4A';
        const BUCKET = 'files';
        const DB_READY = !!(SUPABASE_URL && SUPABASE_KEY);
