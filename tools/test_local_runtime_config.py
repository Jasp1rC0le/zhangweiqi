"""Source guard only; actual local CORS is separately checked against HTTP."""
import ast
from pathlib import Path
import unittest


class LocalRuntimeConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = (Path(__file__).parent / 'start_timetable_local.py').read_text()
        tree = ast.parse(source)
        cls.overrides = {}
        for node in ast.walk(tree):
            if (isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute)
                    and isinstance(node.func.value, ast.Name) and node.func.value.id == 'env'
                    and node.func.attr == 'update' and node.args
                    and isinstance(node.args[0], ast.Dict)):
                for key, value in zip(node.args[0].keys, node.args[0].values):
                    if isinstance(key, ast.Constant) and isinstance(value, ast.Constant):
                        cls.overrides[key.value] = value.value

    def test_exact_development_origins_only(self):
        self.assertEqual(set(self.overrides['CORS_ALLOWED_ORIGINS'].split(',')), {
            'http://localhost:5173', 'http://127.0.0.1:5173'})

    def test_listener_stays_loopback(self):
        self.assertEqual(self.overrides['SERVER_ADDRESS'], '127.0.0.1')

    def test_formal_teaching_and_jobs_stay_disabled(self):
        for key in ('APP_TEACHING_ENABLED', 'APP_TEACHING_IDENTITY_ENABLED',
                    'APP_TEACHING_ROSTER_ENABLED', 'APP_TEACHING_LIFECYCLE_ENABLED',
                    'APP_TEACHING_RESPONSIBILITY_ENABLED', 'APP_TEACHING_LESSON_CHANGE_ENABLED', 'APP_JOBS_ENABLED'):
            self.assertEqual(self.overrides[key], 'false')

    def test_no_automatic_sql_init_or_seeds(self):
        self.assertEqual(self.overrides['SPRING_SQL_INIT_MODE'], 'never')
        for key in ('KNOWLEDGE_SEED_OFFICIAL_SCHOOL', 'CAREER_SEED_OFFICIAL_CANDIDATES'):
            self.assertEqual(self.overrides[key], 'false')


if __name__ == '__main__':
    unittest.main()
