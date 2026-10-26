"""Offline guards: no database or credentials are used in these tests."""
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('restore', Path(__file__).with_name('teaching_restore_drill.py'))
drill = importlib.util.module_from_spec(spec)
spec.loader.exec_module(drill)
SOURCE = 'campthink_http_20261017_737a6ead8e7f'


class RestoreGuardTest(unittest.TestCase):
    def test_source_and_target_are_different_strict_task_names(self):
        for invalid in ['campus_ai', 'campthink_restore_20261017_737a6ead8e7f', SOURCE + ';DROP DATABASE x', SOURCE.upper(), '']:
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                drill.identifier(invalid, drill.SOURCE_PATTERN)
        self.assertEqual(SOURCE, drill.identifier(SOURCE, drill.SOURCE_PATTERN))
        self.assertEqual('campthink_restore_20261017_737a6ead8e7f', drill.identifier('campthink_restore_20261017_737a6ead8e7f', drill.TARGET_PATTERN))

    def test_plain_schema_only_session_table_allowed_but_no_session_data(self):
        allowed = b'CREATE TABLE `auth_sessions` (id CHAR(36));\nINSERT INTO `users` VALUES (1);'
        self.assertEqual(64, len(drill.validate_dump(allowed, SOURCE)))
        for sql in [b'INSERT INTO auth_sessions VALUES (1);', b'INSERT INTO `auth_sessions` VALUES (1);', b'REPLACE INTO `auth_sessions` VALUES (1);']:
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                drill.validate_dump(sql, SOURCE)

    def test_cross_database_destructive_and_local_import_directives_rejected(self):
        for sql in ['USE campus_ai;', 'CREATE DATABASE x;', 'DROP DATABASE x;', 'DROP TABLE users;', 'GRANT ALL ON x TO y;', 'ALTER USER x;', 'SET @@GLOBAL.x=1;', 'SOURCE /tmp/x;', 'LOAD DATA LOCAL INFILE x INTO TABLE y;', 'SELECT * FROM `' + SOURCE + '`.users;']:
            with self.subTest(sql=sql), self.assertRaises(ValueError):
                drill.validate_dump(sql.encode(), SOURCE)

    def test_checksum_covers_actual_bytes_and_rejects_empty_invalid_encoding(self):
        self.assertNotEqual(drill.validate_dump(b'CREATE TABLE a (id INT);', SOURCE), drill.validate_dump(b'CREATE TABLE a (id BIGINT);', SOURCE))
        for data in [b'', b'\xff']:
            with self.assertRaises((ValueError, UnicodeDecodeError)):
                drill.validate_dump(data, SOURCE)

    def test_application_receipt_must_be_for_this_restore_and_real_session_path(self):
        target = 'campthink_restore_20261017_737a6ead8e7f'
        good = dict(schema=target, restoredOldSessions=0, freshSyntheticSessions=5,
                    actualLoopbackTcpHttp=True, actualJwtAndDbSession=True, signedMissingSession401=True,
                    newSessionRevocation401=True, teacher702Secretary400Counselor100=True, studentCrossView403AndNonmember404=True)
        self.assertEqual(good, drill.verify_readback(good, target))
        for changed in [dict(schema='campthink_restore_20261017_000000000000'), dict(actualLoopbackTcpHttp=False), dict(restoredOldSessions=1), dict(freshSyntheticSessions=0)]:
            with self.subTest(changed=changed), self.assertRaises(ValueError):
                drill.verify_readback({**good, **changed}, target)


if __name__ == '__main__':
    unittest.main()
