import unittest
from unittest.mock import patch
from service_database import service_config

class ServiceDatabaseTest(unittest.TestCase):
    def test_prisma_options_preserve_connection_and_ssl(self):
        with patch.dict('os.environ', {'TEOJABI_DATA_SOURCE':'supabase',
                'TEOJABI_DATABASE_URL':'postgresql://postgres:test@db.example.supabase.co:5432/postgres?pgbouncer=true&connection_limit=1&sslmode=require'}):
            config=service_config()
        self.assertEqual(config['host'],'db.example.supabase.co')
        self.assertEqual(config['sslmode'],'require')
        self.assertNotIn('pgbouncer',config)
        self.assertNotIn('connection_limit',config)

if __name__=='__main__': unittest.main()
