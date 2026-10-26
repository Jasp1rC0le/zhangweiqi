"""Offline checks only; these tests never contact a database or start a service."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
from tempfile import TemporaryDirectory

spec = importlib.util.spec_from_file_location('acceptance_install', Path(__file__).with_name('server_isolated_acceptance.py'))
install = importlib.util.module_from_spec(spec)
spec.loader.exec_module(install)
recovery_spec = importlib.util.spec_from_file_location('acceptance_recovery', Path(__file__).with_name('server_isolated_recovery.py'))
recovery = importlib.util.module_from_spec(recovery_spec)
recovery_spec.loader.exec_module(recovery)


class AcceptanceIsolationTest(unittest.TestCase):
    def test_production_database_is_not_a_write_target(self):
        with patch.object(install, 'run') as command:
            with self.assertRaises(RuntimeError):
                install.sql('SELECT 1', 'campus_ai')
            command.assert_not_called()

    def test_synthetic_sql_target_is_explicit(self):
        schema = 'campthink_accept_20261017_0123456789ab'
        with patch.object(install, 'run', return_value='ok') as command:
            self.assertEqual('ok', install.sql('SELECT 1', schema))
            self.assertEqual(schema, command.call_args.args[0][-1])

    def test_metadata_target_is_allowlisted(self):
        with patch.object(install, 'sql') as command:
            with self.assertRaises(RuntimeError):
                install.metadata('other_schema')
            command.assert_not_called()

    def test_transient_service_is_network_restricted_and_bounded(self):
        with patch.object(install, 'run') as command:
            install.unit(install.API_UNIT, ['/usr/bin/java'], install.BASE / 'acceptance.env')
            args = command.call_args.args[0]
            self.assertIn('--property=IPAddressDeny=any', args)
            self.assertIn('--property=IPAddressAllow=localhost', args)
            self.assertIn('--property=MemoryMax=768M', args)
            self.assertIn('--property=NoNewPrivileges=true', args)
            self.assertIn('--collect', args)

    def test_macos_metadata_is_not_read_as_sql(self):
        with TemporaryDirectory() as folder:
            release = Path(folder)
            migrations = release / 'deploy/migrations'
            migrations.mkdir(parents=True)
            (migrations / '2026-valid.sql').write_text('CREATE TABLE IF NOT EXISTS t(id INT);')
            (migrations / '._2026-valid.sql').write_bytes(b'\x00\x05\x16\x07\xa3')
            self.assertEqual(['schema-new-database-only.sql', '2026-valid.sql'], [p.name for p in recovery.migration_files(release)])


if __name__ == '__main__':
    unittest.main()
