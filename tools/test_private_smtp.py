import json
import os
from pathlib import Path
import ssl
import tempfile
import unittest
from unittest.mock import MagicMock, patch
from private_smtp import load_config, apply_to_environment, safe_status, send_test, tls_check


class PrivateSmtpTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='campthink-smtp-unit-')
        self.folder = Path(self.temporary.name).resolve()
        self.file = self.folder / '.env.smtp'
        self.text = ('SMTP_HOST=smtp.exmail.qq.com\nSMTP_PORT=465\nSMTP_USERNAME=contact@campthinkhub.cn\n'
                     'SMTP_FROM=contact@campthinkhub.cn\nSMTP_PASSWORD=\nPUBLIC_WEB_URL=http://localhost:5173\n')
        self.save(self.text)

    def tearDown(self):
        self.temporary.cleanup()

    def save(self, text):
        self.file.write_text(text)
        self.file.chmod(0o600)

    def test_incomplete_file_is_reported_without_connecting_or_exposing_secret(self):
        self.assertFalse(safe_status(self.file)['passwordPresent'])
        with patch('private_smtp.smtplib.SMTP_SSL') as smtp:
            with self.assertRaises(ValueError):
                send_test(self.file)
            smtp.assert_not_called()

    def test_literal_secret_is_not_executed_interpolated_or_displayed(self):
        fake = 'synthetic-$(never-execute)-#-literal'
        self.save(self.text.replace('SMTP_PASSWORD=', 'SMTP_PASSWORD=' + fake))
        self.assertEqual(load_config(self.file)['SMTP_PASSWORD'], fake)
        self.assertNotIn(fake, json.dumps(safe_status(self.file)))

    def test_permissions_symlinks_duplicates_and_foreign_fields_rejected(self):
        self.file.chmod(0o644)
        with self.assertRaises(ValueError):
            load_config(self.file, False)
        self.file.chmod(0o600)
        link = self.folder / 'link'; link.symlink_to(self.file)
        with self.assertRaises(ValueError):
            load_config(link, False)
        for extra in ('SMTP_HOST=smtp.exmail.qq.com', 'JAVA_TOOL_OPTIONS=-unsafe'):
            self.save(self.text + extra + '\n')
            with self.assertRaises(ValueError):
                load_config(self.file, False)

    def test_tls_and_recipient_cannot_be_redirected(self):
        for old, new in [('smtp.exmail.qq.com', 'untrusted.invalid'), ('SMTP_PORT=465', 'SMTP_PORT=25'),
                         ('SMTP_FROM=contact@campthinkhub.cn', 'SMTP_FROM=other@example.invalid'),
                         ('http://localhost:5173', 'http://campthink.cn')]:
            self.save(self.text.replace(old, new))
            with self.assertRaises(ValueError):
                load_config(self.file, False)

    def test_runtime_integration_forces_verified_ssl(self):
        self.save(self.text.replace('SMTP_PASSWORD=', 'SMTP_PASSWORD=synthetic-test-only'))
        env = {'SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY': 'false'}
        apply_to_environment(env, self.file)
        self.assertEqual(env['SMTP_HOST'], 'smtp.exmail.qq.com')
        self.assertEqual(env['SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY'], 'true')
        self.assertEqual(env['SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE'], 'true')

    def test_sending_is_explicit_once_and_receipt_never_contains_secret(self):
        secret = 'synthetic-not-a-real-authorization-code'
        self.save(self.text.replace('SMTP_PASSWORD=', 'SMTP_PASSWORD=' + secret))
        client = MagicMock(); client.send_message.return_value = {}
        with patch('private_smtp.smtplib.SMTP_SSL') as smtp:
            smtp.return_value.__enter__.return_value = client
            result = send_test(self.file)
            context = smtp.call_args.kwargs['context']
            self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED); self.assertTrue(context.check_hostname)
            client.login.assert_called_once_with('contact@campthinkhub.cn', secret)
            self.assertEqual(result['status'], 'smtp-accepted'); self.assertFalse(result['deliveryVerified'])
            self.assertNotIn(secret, (self.folder / 'smtp-last-test.json').read_text())
            with self.assertRaises(ValueError):
                send_test(self.file)
            self.assertEqual(client.send_message.call_count, 1)

    def test_tls_probe_does_not_authenticate_or_send(self):
        client = MagicMock(); client.ehlo.return_value = (250, b'synthetic'); client.sock.version.return_value = 'TLSv1.3'
        with patch('private_smtp.smtplib.SMTP_SSL') as smtp:
            smtp.return_value.__enter__.return_value = client
            self.assertFalse(tls_check(self.file)['sent'])
            client.login.assert_not_called(); client.send_message.assert_not_called()


if __name__ == '__main__':
    unittest.main()
