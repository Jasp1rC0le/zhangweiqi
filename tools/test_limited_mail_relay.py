import json
from email.message import EmailMessage
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from limited_mail_relay import LimitedRelay


class LimitedMailRelayTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='campthink-mail-relay-unit-')
        self.addCleanup(self.temporary.cleanup)
        self.receipt = Path(self.temporary.name) / 'receipt.json'
        self.recipient = 'contact@campthinkhub.cn'
        self.config = {'SMTP_HOST': 'smtp.exmail.qq.com', 'SMTP_PORT': '465',
                       'SMTP_USERNAME': self.recipient, 'SMTP_PASSWORD': 'synthetic-unit-only'}
        self.relay = LimitedRelay(self.config, 'http://[::1]:5193', self.receipt)
        self.addCleanup(self.relay.close)

    def message(self, purpose='verify', origin='http://[::1]:5193', other_to=None):
        message = EmailMessage()
        message['From'] = self.recipient
        message['To'] = other_to or self.recipient
        message['Subject'] = '验证 Campthink 邮箱' if purpose == 'verify' else '重置 Campthink 密码'
        route = '/verify-email' if purpose == 'verify' else '/reset-password'
        message.set_content(origin + route + '#token=' + 'A' * 43)
        return message.as_bytes()

    def deliver(self, data, recipients=None):
        return self.relay.process_message(('127.0.0.1', 10001), self.recipient, recipients or [self.recipient], data)

    def test_unapproved_envelope_header_and_links_never_connect(self):
        with patch('limited_mail_relay.smtplib.SMTP_SSL') as smtp:
            for data, targets in [(self.message(), ['other@example.invalid']),
                                  (self.message(other_to='other@example.invalid'), None),
                                  (self.message(origin='https://untrusted.example.invalid'), None)]:
                self.assertTrue(self.deliver(data, targets).startswith('550'))
            smtp.assert_not_called()

    def test_one_message_per_purpose_and_two_total(self):
        client = MagicMock(); client.sendmail.return_value = {}
        with patch('limited_mail_relay.smtplib.SMTP_SSL') as smtp:
            smtp.return_value.__enter__.return_value = client
            self.assertIsNone(self.deliver(self.message()))
            self.assertTrue(self.deliver(self.message()).startswith('550'))
            self.assertIsNone(self.deliver(self.message('reset')))
            self.assertTrue(self.deliver(self.message('reset')).startswith('550'))
            self.assertEqual(client.sendmail.call_count, 2)
            context = smtp.call_args.kwargs['context']
            self.assertTrue(context.check_hostname)
            self.assertEqual(context.verify_mode, 2)
        content = self.receipt.read_text()
        self.assertNotIn('A' * 43, content)
        self.assertNotIn('synthetic-unit-only', content)
        self.assertEqual(len(json.loads(content)['attempts']), 2)

    def test_failed_or_uncertain_send_consumes_its_attempt(self):
        client = MagicMock(); client.sendmail.side_effect = OSError('synthetic failure')
        with patch('limited_mail_relay.smtplib.SMTP_SSL') as smtp:
            smtp.return_value.__enter__.return_value = client
            self.assertTrue(self.deliver(self.message()).startswith('550'))
            self.assertTrue(self.deliver(self.message()).startswith('550'))
            self.assertEqual(client.sendmail.call_count, 1)
        self.assertEqual(json.loads(self.receipt.read_text())['attempts'][0]['status'], 'failed-or-unconfirmed')

    def test_existing_approval_receipt_cannot_be_replaced(self):
        with self.assertRaises(FileExistsError):
            LimitedRelay(self.config, 'http://[::1]:5193', self.receipt)


if __name__ == '__main__':
    unittest.main()
