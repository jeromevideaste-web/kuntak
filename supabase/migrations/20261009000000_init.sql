-- StbSports — schéma initial
-- Paris sportifs entre amis, sans argent réel.

-- ---------------------------------------------------------------- Tables

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 24),
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  code text not null unique,
  competitions text[] not null check (
    cardinality(competitions) > 0 and competitions <@ array['ligue1', 'ucl', 'nba']
  ),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  season int not null default 1,
  status text not null default 'active' check (status in ('active', 'finished')),
  winner_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  points int not null default 20,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.matches (
  id text primary key, -- 'fb-<id API-Football>' ou 'nba-<id The Odds API>'
  competition text not null check (competition in ('ligue1', 'ucl', 'nba')),
  home_team text not null,
  away_team text not null,
  home_team_ext_id text,
  away_team_ext_id text,
  home_logo text,
  away_logo text,
  kickoff timestamptz not null,
  odds_home numeric(6, 2),
  odds_draw numeric(6, 2),
  odds_away numeric(6, 2),
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'finished', 'cancelled')),
  home_score int,
  away_score int,
  settled boolean not null default false,
  updated_at timestamptz not null default now()
);
create index matches_kickoff_idx on public.matches (kickoff);

create table public.players (
  id text primary key, -- id API-Football
  team_ext_id text not null,
  name text not null,
  position text,
  number int
);
create index players_team_idx on public.players (team_ext_id);

-- Titulaires et buteurs d'un match terminé (football)
create table public.match_players (
  match_id text not null references public.matches (id) on delete cascade,
  player_id text not null,
  started boolean not null default false,
  goals int not null default 0,
  primary key (match_id, player_id)
);

create table public.bets (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  season int not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id text not null references public.matches (id) on delete cascade,
  pick text not null check (pick in ('home', 'draw', 'away')),
  odds numeric(6, 2) not null,
  exact_home int,
  exact_away int,
  stake int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'settled', 'void')),
  winner_won boolean,
  exact_won boolean,
  payout int,
  created_at timestamptz not null default now(),
  unique (group_id, season, user_id, match_id)
);
create index bets_match_pending_idx on public.bets (match_id) where status = 'pending';

create table public.bet_scorers (
  bet_id uuid not null references public.bets (id) on delete cascade,
  player_id text not null,
  outcome text check (outcome in ('won', 'lost', 'refunded')),
  primary key (bet_id, player_id)
);

-- ---------------------------------------------------------------- Helpers

create or replace function public.is_member(g uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from group_members where group_id = g and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------- RLS

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.matches enable row level security;
alter table public.players enable row level security;
alter table public.match_players enable row level security;
alter table public.bets enable row level security;
alter table public.bet_scorers enable row level security;

create policy "profils visibles" on public.profiles for select to authenticated using (true);
create policy "créer son profil" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "modifier son profil" on public.profiles for update to authenticated using (id = auth.uid());

create policy "groupes des membres" on public.groups for select to authenticated using (public.is_member(id));
create policy "membres des groupes" on public.group_members for select to authenticated using (public.is_member(group_id));

create policy "matchs publics" on public.matches for select to authenticated using (true);
create policy "joueurs publics" on public.players for select to authenticated using (true);
create policy "compos publiques" on public.match_players for select to authenticated using (true);

-- On voit ses propres paris ; ceux des amis seulement après le coup d'envoi (pas de copie !)
create policy "paris visibles" on public.bets for select to authenticated using (
  user_id = auth.uid()
  or (public.is_member(group_id) and exists (
    select 1 from public.matches m where m.id = match_id and m.kickoff <= now()
  ))
);
create policy "buteurs visibles" on public.bet_scorers for select to authenticated using (
  exists (select 1 from public.bets b where b.id = bet_id)
);

-- Toutes les écritures passent par les fonctions ci-dessous.

-- ---------------------------------------------------------------- RPC joueur

create or replace function public.create_group(p_name text, p_competitions text[])
returns public.groups language plpgsql security definer set search_path = public as $$
declare
  g groups;
  v_code text;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  loop
    -- 6 caractères sans 0/O/1/I pour éviter les confusions
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      into v_code from generate_series(1, 6);
    exit when not exists (select 1 from groups where code = v_code);
  end loop;
  insert into groups (name, code, competitions, owner_id)
    values (trim(p_name), v_code, p_competitions, auth.uid()) returning * into g;
  insert into group_members (group_id, user_id) values (g.id, auth.uid());
  return g;
end $$;

create or replace function public.join_group(p_code text)
returns public.groups language plpgsql security definer set search_path = public as $$
declare g groups;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  select * into g from groups where code = upper(trim(p_code));
  if not found then raise exception 'Code inconnu'; end if;
  insert into group_members (group_id, user_id) values (g.id, auth.uid()) on conflict do nothing;
  return g;
end $$;

-- Le calcul des mises reprend RULES (scoring.ts) : 5 points par bonus, 3 buteurs max.
create or replace function public.place_bet(
  p_group uuid, p_match text, p_pick text,
  p_exact_home int default null, p_exact_away int default null,
  p_scorers text[] default '{}'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  g groups;
  m matches;
  v_points int;
  v_odds numeric;
  v_stake int;
  v_bet uuid;
  v_has_exact boolean := p_exact_home is not null and p_exact_away is not null;
  v_scorers text[] := coalesce(p_scorers, '{}');
begin
  select * into g from groups where id = p_group;
  if not found or not is_member(p_group) then raise exception 'Groupe introuvable'; end if;
  if g.status <> 'active' then raise exception 'La partie est terminée'; end if;

  select * into m from matches where id = p_match;
  if not found or not (m.competition = any (g.competitions)) then raise exception 'Match indisponible'; end if;
  if m.kickoff <= now() or m.status <> 'scheduled' then raise exception 'Les paris sont fermés pour ce match'; end if;

  v_odds := case p_pick when 'home' then m.odds_home when 'draw' then m.odds_draw when 'away' then m.odds_away end;
  if v_odds is null or v_odds <= 1 then raise exception 'Cote indisponible'; end if;

  if m.competition = 'nba' and (v_has_exact or cardinality(v_scorers) > 0) then
    raise exception 'Les bonus ne sont pas disponibles en NBA';
  end if;
  if v_has_exact and (p_exact_home not between 0 and 20 or p_exact_away not between 0 and 20) then
    raise exception 'Score exact invalide';
  end if;
  if cardinality(v_scorers) > 3 then raise exception '3 buteurs maximum'; end if;
  if (select count(distinct s) from unnest(v_scorers) s) <> cardinality(v_scorers) then
    raise exception 'Buteur en double';
  end if;
  if exists (
    select 1 from unnest(v_scorers) s
    where not exists (select 1 from players p where p.id = s and p.team_ext_id in (m.home_team_ext_id, m.away_team_ext_id))
  ) then raise exception 'Joueur inconnu pour ce match'; end if;

  v_stake := (case when v_has_exact then 5 else 0 end) + 5 * cardinality(v_scorers);

  select points into v_points from group_members
    where group_id = p_group and user_id = auth.uid() for update;
  if v_points < v_stake then raise exception 'Pas assez de points (% nécessaires)', v_stake; end if;

  insert into bets (group_id, season, user_id, match_id, pick, odds, exact_home, exact_away, stake)
    values (p_group, g.season, auth.uid(), p_match, p_pick, v_odds,
            case when v_has_exact then p_exact_home end, case when v_has_exact then p_exact_away end, v_stake)
    returning id into v_bet;
  insert into bet_scorers (bet_id, player_id) select v_bet, s from unnest(v_scorers) s;
  update group_members set points = points - v_stake where group_id = p_group and user_id = auth.uid();
  return v_bet;
exception when unique_violation then
  raise exception 'Tu as déjà parié sur ce match';
end $$;

-- Relancer une nouvelle partie (créateur du groupe uniquement)
create or replace function public.restart_group(p_group uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update groups set season = season + 1, status = 'active', winner_id = null
    where id = p_group and owner_id = auth.uid();
  if not found then raise exception 'Seul le créateur du groupe peut relancer la partie'; end if;
  update group_members set points = 20 where group_id = p_group;
end $$;

create or replace function public.leave_group(p_group uuid)
returns void language sql security definer set search_path = public as $$
  delete from group_members where group_id = p_group and user_id = auth.uid();
$$;

-- Exigé par Apple : suppression du compte depuis l'application
create or replace function public.delete_account()
returns void language sql security definer set search_path = public, auth as $$
  delete from auth.users where id = auth.uid();
$$;

-- ---------------------------------------------------------------- RPC serveur (règlement)

create or replace function public.apply_settlement(
  p_bet uuid, p_status text, p_payout int, p_winner_won boolean, p_exact_won boolean, p_scorers jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare b bets;
begin
  update bets set status = p_status, payout = p_payout, winner_won = p_winner_won, exact_won = p_exact_won
    where id = p_bet and status = 'pending' returning * into b;
  if not found then return; end if; -- déjà réglé
  update bet_scorers bs set outcome = s.outcome
    from jsonb_to_recordset(p_scorers) as s (player_id text, outcome text)
    where bs.bet_id = p_bet and bs.player_id = s.player_id;
  -- Les points ne comptent que si le pari appartient à la partie en cours
  update group_members gm set points = gm.points + p_payout
    from groups g
    where gm.group_id = b.group_id and gm.user_id = b.user_id
      and g.id = b.group_id and g.season = b.season and g.status = 'active';
end $$;

-- Marque le match réglé et désigne les vainqueurs (premier à 500 points)
create or replace function public.close_match(p_match text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update matches set settled = true where id = p_match;
  update groups g set status = 'finished', winner_id = w.user_id
    from (
      select distinct on (gm.group_id) gm.group_id, gm.user_id
      from group_members gm
      where gm.points >= 500
      order by gm.group_id, gm.points desc, gm.joined_at
    ) w
    where g.id = w.group_id and g.status = 'active';
end $$;

revoke execute on function public.apply_settlement(uuid, text, int, boolean, boolean, jsonb) from public, anon, authenticated;
revoke execute on function public.close_match(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- Profil automatique à l'inscription

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text := left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'username'), ''), split_part(new.email, '@', 1)), 19);
begin
  if char_length(v_name) < 2 then v_name := 'joueur'; end if;
  if exists (select 1 from profiles where username = v_name) then
    v_name := v_name || '-' || substr(replace(new.id::text, '-', ''), 1, 4);
  end if;
  insert into profiles (id, username) values (new.id, v_name);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
