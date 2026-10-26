"""Use an owner-only local SMTP file; never print its authorization secret."""
import argparse
from datetime import datetime
from email.message import EmailMessage
from email.utils import make_msgid
import json
import os
from pathlib import Path
import smtplib
import ssl
import stat
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / '.local/private/.env.smtp'
RECIPIENT = 'contact@campthinkhub.cn'
KEYS = {'SMTP_HOST', 'SMTP_PORT', 'SMTP_USERNAME', 'SMTP_FROM', 'SMTP_PASSWORD', 'PUBLIC_WEB_URL'}


def private_file(path):
    path = Path(path).absolute()
    info = path.lstat()
    if path.resolve() != path or not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) not in (0o400, 0o600):
        raise ValueError('SMTP配置必须为真实普通文件，权限600或400')
    if hasattr(os, 'getuid') and info.st_uid != os.getuid():
        raise ValueError('SMTP配置须归当前用户所有')
    if stat.S_IMODE(path.parent.stat().st_mode) & 0o077:
        raise ValueError('SMTP私有目录须为700权限')
    return path


def load_config(path=DEFAULT_CONFIG, require_password=True):
    path = private_file(path)
    if path.stat().st_size > 16384:
        raise ValueError('SMTP配置文件过大')
    config = {}
    for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        key, separator, value = line.partition('=')
        key = key.strip()
        if not separator or key not in KEYS or key in config:
            raise ValueError(f'SMTP配置第{number}行格式、字段或重复项无效')
        if value != value.strip() or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError(f'SMTP配置第{number}行含多余空白或控制字符')
        config[key] = value  # literal values only: never source/eval/interpolate.
    if set(config) != KEYS:
        raise ValueError('SMTP配置字段不完整')
    if config['SMTP_HOST'] != 'smtp.exmail.qq.com' or config['SMTP_PORT'] != '465':
        raise ValueError('本配置仅允许腾讯企业邮箱官方SMTP地址与465 SSL端口')
    if config['SMTP_USERNAME'] != RECIPIENT or config['SMTP_FROM'] != RECIPIENT:
        raise ValueError('发件账户须与用户确认的企业邮箱一致')
    value = config['PUBLIC_WEB_URL']
    url = urlsplit(value)
    local = url.scheme == 'http' and url.hostname in ('localhost', '127.0.0.1')
    public = url.scheme == 'https' and url.hostname == 'campthink.cn'
    if not (local or public) or url.username or url.password or url.query or url.fragment or url.path not in ('', '/'):
        raise ValueError('PUBLIC_WEB_URL须为本机来源或已核验的campthink.cn HTTPS来源')
    secret = config['SMTP_PASSWORD']
    if require_password and (not secret or secret in ('CHANGEME', '填入授权码', 'SMTP_PASSWORD')):
        raise ValueError('SMTP_PASSWORD尚未填写；不连接、不尝试登录')
    return config


def apply_to_environment(environment, path):
    config = load_config(path)
    environment.update(config)
    environment.update({
        'SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH': 'true',
        'SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_ENABLE': 'true',
        'SPRING_MAIL_PROPERTIES_MAIL_SMTP_SSL_CHECKSERVERIDENTITY': 'true',
        'SPRING_MAIL_PROPERTIES_MAIL_SMTP_CONNECTIONTIMEOUT': '5000',
        'SPRING_MAIL_PROPERTIES_MAIL_SMTP_TIMEOUT': '5000',
        'SPRING_MAIL_PROPERTIES_MAIL_SMTP_WRITETIMEOUT': '5000',
    })


def safe_status(path=DEFAULT_CONFIG):
    config = load_config(path, require_password=False)
    return {'host': config['SMTP_HOST'], 'port': int(config['SMTP_PORT']), 'ssl': True,
            'certificateVerification': True, 'username': config['SMTP_USERNAME'],
            'from': config['SMTP_FROM'], 'publicWebUrl': config['PUBLIC_WEB_URL'],
            'passwordPresent': bool(config['SMTP_PASSWORD']), 'secretDisplayed': False}


def tls_check(path=DEFAULT_CONFIG):
    config = load_config(path, require_password=False)
    with smtplib.SMTP_SSL(config['SMTP_HOST'], int(config['SMTP_PORT']), timeout=8,
                          context=ssl.create_default_context()) as client:
        code, _ = client.ehlo()
        if code != 250:
            raise ValueError('SMTP服务器未接受EHLO，未登录或发送')
        return {'tls': client.sock.version(), 'ehlo': code, 'authenticated': False, 'sent': False}


def send_test(path=DEFAULT_CONFIG, retry=False):
    config = load_config(path)
    folder = Path(path).parent
    marker = folder / 'smtp-last-test.json'
    lock = folder / 'smtp-test.lock'
    if marker.exists() and not retry:
        raise ValueError('已有测试回执；不自动重发。先核对是否收到，明确要求后才用--retry-test')
    if marker.exists():
        private_file(marker)
    descriptor = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(descriptor)
    record = {'at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(), 'recipient': RECIPIENT,
              'status': 'pending', 'deliveryVerified': False}
    def persist():
        fd = os.open(marker, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            json.dump(record, output, ensure_ascii=False, indent=2)
    try:
        # Recheck after obtaining the exclusive lock, before any external action.
        if marker.exists() and not retry:
            raise ValueError('另一个测试已有回执，不重复发送')
        persist()
        message = EmailMessage()
        message['From'] = config['SMTP_FROM']
        message['To'] = RECIPIENT
        message['Subject'] = 'Campthink SMTP配置验收'
        message['Message-ID'] = make_msgid(domain='campthinkhub.cn')
        message.set_content('这是一封由你授权的Campthink本机SMTP验收邮件。\n不含登录链接、授权码或用户资料。\n请确认是否在收件箱或垃圾邮件中收到。\n' + record['at'])
        with smtplib.SMTP_SSL(config['SMTP_HOST'], int(config['SMTP_PORT']), timeout=8,
                              context=ssl.create_default_context()) as client:
            client.login(config['SMTP_USERNAME'], config['SMTP_PASSWORD'])
            refused = client.send_message(message)
            if refused:
                raise ValueError('SMTP未接受收件人')
        record.update(status='smtp-accepted', messageId=message['Message-ID'])
        persist()
        return record
    except Exception as failure:
        record.update(status='failed-or-unconfirmed', failureType=type(failure).__name__)
        persist()
        raise ValueError('SMTP测试失败或结果未确认；未更换凭据或绕过TLS，请先核对私有配置及回执') from None
    finally:
        lock.unlink(missing_ok=True)  # only the lock created by this invocation.


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('check', 'tls-check', 'send-test'))
    parser.add_argument('--config', type=Path, default=DEFAULT_CONFIG)
    parser.add_argument('--retry-test', action='store_true', help='Explicitly authorized retry only; never automatic')
    args = parser.parse_args()
    try:
        if args.mode == 'check':
            result = safe_status(args.config)
            print(json.dumps(result, ensure_ascii=False))
            return 0 if result['passwordPresent'] else 2
        result = tls_check(args.config) if args.mode == 'tls-check' else send_test(args.config, args.retry_test)
        print(json.dumps(result, ensure_ascii=False))
        return 0
    except (ValueError, OSError, smtplib.SMTPException) as error:
        # Never print an SMTP server response, password, or raw configuration.
        message = str(error) if isinstance(error, ValueError) else 'SMTP网络、TLS或私有文件检查未通过；未绕过检查'
        print(json.dumps({'ready': False, 'message': message, 'failureType': type(error).__name__}, ensure_ascii=False))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
