"""Verify immutable local JAR staging without starting Java or touching any database."""
import hashlib
from pathlib import Path
import tempfile
import unittest
from runtime_artifact import stage_runtime_artifact


class RuntimeArtifactTests(unittest.TestCase):
    def setUp(self):
        self.fixture = tempfile.TemporaryDirectory(prefix='campthink-runtime-artifact-')
        self.addCleanup(self.fixture.cleanup)
        self.root = Path(self.fixture.name)
        self.jar = self.root / 'candidate.jar'
        self.jar.write_bytes(b'test-only-jar-bytes')
        self.digest = hashlib.sha256(self.jar.read_bytes()).hexdigest()
        self.runtime = self.root / 'runtime'

    def test_verified_artifact_is_staged_once_with_full_digest(self):
        first, digest = stage_runtime_artifact(self.jar, self.runtime, self.digest)
        self.assertEqual(digest, self.digest)
        self.assertEqual(first.read_bytes(), self.jar.read_bytes())
        self.assertEqual(first.stat().st_mode & 0o777, 0o600)
        before = first.stat().st_ino
        second, _ = stage_runtime_artifact(self.jar, self.runtime, self.digest)
        self.assertEqual(second.stat().st_ino, before)

    def test_wrong_or_malformed_expected_hash_never_stages(self):
        for expected in ('bad', '0' * 64, self.digest[:16]):
            with self.subTest(expected=expected), self.assertRaises(ValueError):
                stage_runtime_artifact(self.jar, self.runtime, expected)
        self.assertFalse(self.runtime.exists())

    def test_existing_damaged_artifact_is_not_overwritten(self):
        self.runtime.mkdir()
        target = self.runtime / f'campus-ai-timetable-{self.digest[:16]}.jar'
        target.write_bytes(b'existing-do-not-overwrite')
        with self.assertRaises(ValueError):
            stage_runtime_artifact(self.jar, self.runtime, self.digest)
        self.assertEqual(target.read_bytes(), b'existing-do-not-overwrite')
        self.assertEqual(list(self.runtime.iterdir()), [target])

    def test_source_and_destination_symlinks_are_refused(self):
        link = self.root / 'linked.jar'
        link.symlink_to(self.jar)
        with self.assertRaises(ValueError):
            stage_runtime_artifact(link, self.runtime, self.digest)
        self.runtime.mkdir()
        destination = self.runtime / f'campus-ai-timetable-{self.digest[:16]}.jar'
        destination.symlink_to(self.jar)
        with self.assertRaises(ValueError):
            stage_runtime_artifact(self.jar, self.runtime, self.digest)
        self.assertTrue(destination.is_symlink())

    def test_launcher_requires_full_hash_for_explicit_candidate_before_migration(self):
        source = (Path(__file__).parent / 'start_timetable_local.py').read_text()
        self.assertIn("parser.add_argument('--jar'", source)
        self.assertIn("parser.add_argument('--expected-sha256'", source)
        self.assertIn('if options.jar and not options.expected_sha256:', source)
        self.assertLess(source.index('stage_runtime_artifact(jar,'), source.index('if not options.skip_migration:'))


if __name__ == '__main__':
    unittest.main()
