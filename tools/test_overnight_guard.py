import unittest
from datetime import datetime, timedelta, timezone
from overnight_guard import battery_percent, stop_reason


class GuardTest(unittest.TestCase):
    def test_battery_read_is_bounded_and_does_not_assume_full_charge(self):
        self.assertEqual(58, battery_percent(' -InternalBattery-0 (id=35520611)\t58%; discharging;'))
        self.assertEqual(9, battery_percent('9%; charging;'))
        for value in ['', 'Battery unavailable', '999%;', '1000%;']:
            self.assertIsNone(battery_percent(value))

    def test_deadline_and_low_battery_do_not_keep_the_guard_alive(self):
        now = datetime(2026, 10, 14, 16, tzinfo=timezone.utc)
        deadline = now + timedelta(hours=9)
        self.assertEqual('low-battery', stop_reason(now, deadline, 9))
        self.assertIsNone(stop_reason(now, deadline, 10))
        self.assertEqual('deadline', stop_reason(deadline, deadline, 58))
        self.assertEqual('battery-unknown', stop_reason(now, deadline, None))


if __name__ == '__main__':
    unittest.main()
