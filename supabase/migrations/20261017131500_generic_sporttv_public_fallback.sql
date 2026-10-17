begin;

do $$
declare
  v_generic_channel_id uuid;
  v_sport_tv_1_logo text;
begin
  select channel.id
    into v_generic_channel_id
  from public.broadcast_channels as channel
  where lower(regexp_replace(channel.name, '[^a-z0-9]+', '', 'g')) = 'sporttv'
  order by channel.created_at asc, channel.id asc
  limit 1;

  if v_generic_channel_id is null then
    select channel.logo_url
      into v_sport_tv_1_logo
    from public.broadcast_channels as channel
    where channel.name = 'Sport TV 1'
    order by channel.created_at asc, channel.id asc
    limit 1;

    insert into public.broadcast_channels (
      name,
      platform,
      country,
      logo_url
    )
    values (
      'SportTV',
      'Sport TV',
      'Portugal',
      v_sport_tv_1_logo
    )
    returning id into v_generic_channel_id;
  end if;

  update public.matches as match_row
     set broadcast_channel_id = v_generic_channel_id
    from public.matchdays as matchday,
         public.seasons as season,
         public.competitions as competition
   where match_row.matchday_id = matchday.id
     and matchday.season_id = season.id
     and season.competition_id = competition.id
     and competition.slug = 'liga-portugal'
     and season.label = '2026/27'
     and matchday.number = 9
     and lower(coalesce(match_row.status, '')) = 'scheduled'
     and match_row.broadcast_channel_id is null;
end
$$;

commit;
