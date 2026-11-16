create type public.app_role as enum ('admin','user');
create table public.user_roles (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade not null, role app_role not null, unique(user_id, role));
grant select on public.user_roles to authenticated; grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create or replace function public.has_role(_user_id uuid, _role app_role) returns boolean language sql stable security definer set search_path = public as $$ select exists (select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "admin manage roles" on public.user_roles for all to authenticated using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

create table public.companies (id uuid primary key default gen_random_uuid(), name text not null, nse_symbol text unique, bse_code text, cin text, sector text, website text, created_at timestamptz not null default now());
grant select on public.companies to anon, authenticated; grant insert on public.companies to authenticated; grant all on public.companies to service_role;
alter table public.companies enable row level security;
create policy "read companies" on public.companies for select using (true);
create policy "add companies" on public.companies for insert to authenticated with check (true);
create policy "admin edit companies" on public.companies for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin delete companies" on public.companies for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.research_jobs (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, requested_by uuid, status text not null default 'running', stage text, error text, report jsonb, sources_found int default 0, created_at timestamptz not null default now(), completed_at timestamptz);
grant select on public.research_jobs to authenticated; grant all on public.research_jobs to service_role;
alter table public.research_jobs enable row level security;
create policy "read jobs" on public.research_jobs for select to authenticated using (true);
create index on public.research_jobs(company_id, created_at desc);

create table public.documents (id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, title text not null, url text not null, doc_type text not null default 'other', source_domain text, published_at text, excerpt text, extraction_status text not null default 'extracted', created_at timestamptz not null default now(), unique(company_id, url));
grant select on public.documents to authenticated; grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "read docs" on public.documents for select to authenticated using (true);
create policy "admin delete docs" on public.documents for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.research_history (id uuid primary key default gen_random_uuid(), user_id uuid not null, company_id uuid not null references public.companies(id) on delete cascade, viewed_at timestamptz not null default now(), unique(user_id, company_id));
grant select, insert, update, delete on public.research_history to authenticated; grant all on public.research_history to service_role;
alter table public.research_history enable row level security;
create policy "own history" on public.research_history for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.chat_messages (id uuid primary key default gen_random_uuid(), user_id uuid not null, company_id uuid not null references public.companies(id) on delete cascade, role text not null, content text not null, created_at timestamptz not null default now());
grant select, insert, delete on public.chat_messages to authenticated; grant all on public.chat_messages to service_role;
alter table public.chat_messages enable row level security;
create policy "own chat" on public.chat_messages for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- first user becomes admin
create or replace function public.handle_new_user_role() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles(user_id, role) values (new.id, case when not exists (select 1 from public.user_roles where role='admin') then 'admin'::app_role else 'user'::app_role end);
  return new;
end $$;
create trigger on_auth_user_created_role after insert on auth.users for each row execute function public.handle_new_user_role();

insert into public.companies (name, nse_symbol, bse_code, sector, website) values
('Reliance Industries Ltd','RELIANCE','500325','Conglomerate','ril.com'),
('Tata Consultancy Services Ltd','TCS','532540','IT Services','tcs.com'),
('HDFC Bank Ltd','HDFCBANK','500180','Banking','hdfcbank.com'),
('Infosys Ltd','INFY','500209','IT Services','infosys.com'),
('ICICI Bank Ltd','ICICIBANK','532174','Banking','icicibank.com'),
('Hindustan Unilever Ltd','HINDUNILVR','500696','FMCG','hul.co.in'),
('ITC Ltd','ITC','500875','FMCG','itcportal.com'),
('State Bank of India','SBIN','500112','Banking','sbi.co.in'),
('Bharti Airtel Ltd','BHARTIARTL','532454','Telecom','airtel.in'),
('Larsen & Toubro Ltd','LT','500510','Engineering','larsentoubro.com'),
('Kotak Mahindra Bank Ltd','KOTAKBANK','500247','Banking','kotak.com'),
('Axis Bank Ltd','AXISBANK','532215','Banking','axisbank.com'),
('Bajaj Finance Ltd','BAJFINANCE','500034','NBFC','bajajfinserv.in'),
('Asian Paints Ltd','ASIANPAINT','500820','Paints','asianpaints.com'),
('Maruti Suzuki India Ltd','MARUTI','532500','Automobiles','marutisuzuki.com'),
('Sun Pharmaceutical Industries Ltd','SUNPHARMA','524715','Pharma','sunpharma.com'),
('Titan Company Ltd','TITAN','500114','Consumer','titancompany.in'),
('Wipro Ltd','WIPRO','507685','IT Services','wipro.com'),
('HCL Technologies Ltd','HCLTECH','532281','IT Services','hcltech.com'),
('Mahindra & Mahindra Ltd','M&M','500520','Automobiles','mahindra.com'),
('Tata Motors Ltd','TATAMOTORS','500570','Automobiles','tatamotors.com'),
('Tata Steel Ltd','TATASTEEL','500470','Metals','tatasteel.com'),
('Adani Enterprises Ltd','ADANIENT','512599','Conglomerate','adanienterprises.com'),
('Adani Ports and SEZ Ltd','ADANIPORTS','532921','Infrastructure','adaniports.com'),
('NTPC Ltd','NTPC','532555','Power','ntpc.co.in'),
('Power Grid Corporation of India Ltd','POWERGRID','532898','Power','powergrid.in'),
('UltraTech Cement Ltd','ULTRACEMCO','532538','Cement','ultratechcement.com'),
('Nestle India Ltd','NESTLEIND','500790','FMCG','nestle.in'),
('Zomato Ltd (Eternal)','ETERNAL','543320','Internet','eternal.com'),
('Paytm (One 97 Communications)','PAYTM','543396','Fintech','paytm.com'),
('Yes Bank Ltd','YESBANK','532648','Banking','yesbank.in'),
('Vedanta Ltd','VEDL','500295','Metals','vedantalimited.com'),
('Dr. Reddy''s Laboratories Ltd','DRREDDY','500124','Pharma','drreddys.com'),
('Coal India Ltd','COALINDIA','533278','Mining','coalindia.in'),
('Bajaj Auto Ltd','BAJAJ-AUTO','532977','Automobiles','bajajauto.com'),
('DMart (Avenue Supermarts)','DMART','540376','Retail','dmartindia.com'),
('Pidilite Industries Ltd','PIDILITIND','500331','Chemicals','pidilite.com'),
('IndusInd Bank Ltd','INDUSINDBK','532187','Banking','indusind.com'),
('Hindalco Industries Ltd','HINDALCO','500440','Metals','hindalco.com'),
('Jio Financial Services Ltd','JIOFIN','543940','NBFC','jfs.in');