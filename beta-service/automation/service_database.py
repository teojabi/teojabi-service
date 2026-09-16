"""Explicit data-service connection. Crawler local_config remains unchanged."""
import os
from psycopg2.extensions import parse_dsn
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

def service_config():
    mode=os.getenv('TEOJABI_DATA_SOURCE', 'local')
    if os.getenv('TEOJABI_SERVICE_MODE')=='production' and mode!='supabase':
        raise ValueError('Production cannot use local database')
    if mode not in ('supabase','remote'):
        from inspect_naver_sync import local_config
        return local_config()
    dsn=os.getenv('TEOJABI_DATABASE_URL') or os.getenv('DATABASE_URL')
    if not dsn:
        raise ValueError('Supabase database URL required')
    parts=urlsplit(dsn)
    query=[(key,value) for key,value in parse_qsl(parts.query,keep_blank_values=True)
           if key not in ('pgbouncer','connection_limit')]
    dsn=urlunsplit((parts.scheme,parts.netloc,parts.path,urlencode(query),parts.fragment))
    config=parse_dsn(dsn)
    host=config.get('host','')
    if not (host.endswith('.supabase.co') or host.endswith('.pooler.supabase.com')):
        raise ValueError('Supabase host required')
    if config.get('port','5432') not in ('5432','6543'):
        raise ValueError('Invalid database port')
    config['sslmode']='require'
    return config
