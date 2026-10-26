"""Manual acceptance relay: two approved business messages, one fixed recipient, no token logs."""
import argparse
import asyncore
from datetime import datetime, timezone
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
import json
import os
from pathlib import Path
import re
import signal
import smtpd
import smtplib
import ssl
import time
from urllib.parse import urlsplit
from private_smtp import load_config, RECIPIENT


class LimitedRelay(smtpd.SMTPServer):
    def __init__(self, config, origin, receipt):
        self.config, self.origin, self.receipt = config, origin, receipt
        self.record = {'recipient': RECIPIENT, 'maximumAttempts': 2, 'attempts': [], 'rawMessagesStored': False}
        fd = os.open(receipt, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as output:
            json.dump(self.record, output, indent=2)
        super().__init__(('127.0.0.1', 0), None, data_size_limit=65536, decode_data=False)

    def persist(self):
        fd = os.open(self.receipt, os.O_WRONLY | os.O_TRUNC | os.O_NOFOLLOW)
        with os.fdopen(fd, 'w') as output:
            json.dump(self.record, output, indent=2)

    def process_message(self, peer, mailfrom, recipients, data, **kwargs):
        if peer[0] != '127.0.0.1' or mailfrom.lower() != RECIPIENT or [r.lower() for r in recipients] != [RECIPIENT]:
            return '550 Recipient or sender not approved'
        message = BytesParser(policy=policy.default).parsebytes(data)
        kinds = {'验证 Campthink 邮箱': ('verify', '/verify-email'), '重置 Campthink 密码': ('reset', '/reset-password')}
        selected = kinds.get(str(message.get('Subject', '')))
        if not selected or message.get('Cc') or message.get('Bcc'):
            return '550 Message purpose not approved'
        if parseaddr(str(message.get('From', '')))[1].lower() != RECIPIENT or parseaddr(str(message.get('To', '')))[1].lower() != RECIPIENT:
            return '550 Header destination not approved'
        purpose, target = selected
        body = message.get_body(preferencelist=('plain',))
        content = body.get_content() if body else ''
        links = re.findall(r'https?://[^\s]+', content)
        if len(links) != 1:
            return '550 Expected one local acceptance link'
        link, approved = urlsplit(links[0]), urlsplit(self.origin)
        if (link.scheme, link.netloc, link.path) != (approved.scheme, approved.netloc, target) or link.query or not re.fullmatch(r'token=[A-Za-z0-9_-]{43}', link.fragment):
            return '550 Link destination not approved'
        attempts = self.record['attempts']
        if len(attempts) >= 2 or any(a['purpose'] == purpose for a in attempts):
            return '550 Acceptance quota already used; no automatic resend'
        entry = {'purpose': purpose, 'at': datetime.now(timezone.utc).isoformat(), 'status': 'pending'}
        attempts.append(entry)
        self.persist()  # Reserve before external activity; failures cannot retry automatically.
        try:
            with smtplib.SMTP_SSL(self.config['SMTP_HOST'], int(self.config['SMTP_PORT']), timeout=8,
                                  context=ssl.create_default_context()) as client:
                client.login(self.config['SMTP_USERNAME'], self.config['SMTP_PASSWORD'])
                refused = client.sendmail(RECIPIENT, [RECIPIENT], data)
                if refused:
                    raise RuntimeError('Recipient was not accepted')
            entry['status'] = 'smtp-accepted'
            self.persist()
            print(json.dumps({'event': 'smtp-accepted', 'purpose': purpose, 'recipient': RECIPIENT}), flush=True)
            return None
        except Exception as error:
            entry.update(status='failed-or-unconfirmed', failureType=type(error).__name__)
            self.persist()
            return '550 SMTP acceptance failed or unconfirmed; no retry'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--receipt', type=Path, required=True)
    parser.add_argument('--confirmed-recipient', required=True)
    args = parser.parse_args()
    parsed = urlsplit(args.origin)
    if args.confirmed_recipient != RECIPIENT or parsed.scheme != 'http' or parsed.hostname != '::1' or not parsed.port or parsed.path or parsed.query or parsed.fragment or parsed.username:
        raise SystemExit('Explicit approved recipient and IPv6 loopback origin required')
    if args.receipt.parent.stat().st_mode & 0o077 or args.receipt.exists() or args.receipt.is_symlink():
        raise SystemExit('Fresh receipt in an owner-only directory required')
    config = load_config(args.config)
    server = LimitedRelay(config, args.origin, args.receipt)
    signal.signal(signal.SIGTERM, lambda *_: server.close())
    signal.signal(signal.SIGINT, lambda *_: server.close())
    print(json.dumps({'event': 'ready', 'port': server.socket.getsockname()[1]}), flush=True)
    until = time.monotonic() + 1500
    try:
        while asyncore.socket_map and time.monotonic() < until:
            asyncore.loop(timeout=1, count=1)
    finally:
        asyncore.close_all()


if __name__ == '__main__':
    main()
