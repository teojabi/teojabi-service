CREATE OR REPLACE FUNCTION public.send_daily_summary_telegram()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO public
AS $function$
declare
  v_today       date;
  v_yesterday   date;
  v_new_signups int;
  v_total_users int;
  v_active_users int;
  v_cond_users  int;
  v_email_on    int;
  v_email_off   int;
  v_sent        int;
  v_failed      int;
  v_cursor_h    numeric;
  v_naver_h     numeric;
  v_disco_h     numeric;
  v_auction_h   numeric;
  v_onbid_h     numeric;
  v_issues      int := 0;
  v_status      text;
  v_text        text;
begin
  v_today := (now() at time zone 'Asia/Seoul')::date;
  v_yesterday := v_today - 1;

  -- user.created_at는 timestamp without time zone (KST 저장). AT TIME ZONE 쓰면 하루 빠지는 버그가 있어 직접 ::date.
  select count(*) into v_new_signups from "user" where created_at::date = v_yesterday;
  select count(*) into v_total_users from "user";

  -- 알림 대상 회원 / 오늘(08:30 KST 발송분) 성공·실패
  select count(distinct user_id) into v_active_users from discovery_item
   where (kind = 'condition' and coalesce(payload->>'alerts','true') <> 'false') or kind = 'favorite';
  select
    coalesce(count(*) filter (where status = 'SENT'), 0),
    coalesce(count(*) filter (where status = 'FAILED'), 0)
  into v_sent, v_failed
  from notification_delivery where dedupe_key like 'email:%:' || to_char(v_today, 'YYYY-MM-DD');

  -- 전환 지표: 조건을 설정한 회원 수 / 이메일 알림을 켠 회원 수(기본 켜짐, 명시적으로 끈 사람 제외)
  select count(distinct user_id) into v_cond_users from discovery_item where kind = 'condition';
  select count(*) into v_email_off from notification_preference where email = false;
  v_email_on := greatest(coalesce(v_total_users,0) - coalesce(v_email_off,0), 0);

  -- 데이터 신선도(시간) — 로더가 실제 수집·갱신한 시각 기준.
  -- naver는 매일 신규가 들어와 first_seen_at이 전진, 나머지는 crawled_at/last_seen_at이 수집 시각.
  select round(extract(epoch from (now() - max(first_seen_at))) / 3600) into v_naver_h from naver;
  select round(extract(epoch from (now() - max(last_seen_at))) / 3600) into v_disco_h from disco_listing where active is true;
  select round(extract(epoch from (now() - max(crawled_at))) / 3600) into v_auction_h from auction_item;
  select round(extract(epoch from (now() - max(crawled_at))) / 3600) into v_onbid_h from onbid_item;

  -- 알림 커서 경과(시간)
  select round(extract(epoch from (now() - last_seen_at)) / 3600) into v_cursor_h
   from notification_source_cursor where source = 'all' limit 1;

  -- 이상 여부
  if v_naver_h   is null or v_naver_h   > 30 then v_issues := v_issues + 1; end if;
  if v_disco_h   is null or v_disco_h   > 30 then v_issues := v_issues + 1; end if;
  if v_auction_h is null or v_auction_h > 36 then v_issues := v_issues + 1; end if;
  if v_onbid_h   is null or v_onbid_h   > 36 then v_issues := v_issues + 1; end if;
  if v_cursor_h  is null or v_cursor_h  > 26 then v_issues := v_issues + 1; end if;
  if v_failed    > 0 then v_issues := v_issues + 1; end if;

  v_status := case when v_issues = 0 then '✅ 정상' else '⚠️ 확인 필요 (' || v_issues || ')' end;

  v_text := '🩺 터잡이 일일 점검 (' || to_char(v_today, 'YYYY-MM-DD') || ') — ' || v_status || E'\n'
    || E'\n'
    || '▫ 신규 가입자: ' || coalesce(v_new_signups,0) || '명 / 총 ' || coalesce(v_total_users,0) || '명' || E'\n'
    || '· 조건 설정: ' || coalesce(v_cond_users,0) || '명 ('
      || case when coalesce(v_total_users,0)=0 then 0 else round(100.0*coalesce(v_cond_users,0)/v_total_users) end || '%) · 이메일 알림 '
      || case when coalesce(v_total_users,0)=0 then 0 else round(100.0*v_email_on/v_total_users) end || '%' || E'\n'
    || E'\n'
    || '📦 데이터 갱신(시간 전)' || E'\n'
    || '· 네이버 ' || coalesce(v_naver_h,-1) || 'h · 디스코 ' || coalesce(v_disco_h,-1) || 'h' || E'\n'
    || '· 경매 ' || coalesce(v_auction_h,-1) || 'h · 공매 ' || coalesce(v_onbid_h,-1) || 'h' || E'\n'
    || E'\n'
    || '🔔 알림' || E'\n'
    || '· 대상 회원 ' || coalesce(v_active_users,0) || '명' || E'\n'
    || '· 오늘 발송 성공 ' || coalesce(v_sent,0) || ' / 실패 ' || coalesce(v_failed,0) || E'\n'
    || '· 커서 ' || coalesce(v_cursor_h,-1) || 'h 전';

  begin
    perform net.http_post(
      url     := 'https://api.telegram.org/bot8764123685:AAEUAPVN1TPfHLWLHE3GbNIvFMRCnaZiiUE/sendMessage',
      body    := jsonb_build_object('chat_id', '6607405625', 'text', v_text),
      headers := jsonb_build_object('Content-Type', 'application/json')
    );
  exception when others then
    null;
  end;
end;
$function$;
