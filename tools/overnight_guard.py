"""Task-owned, time-bounded macOS idle guard. Never alter permanent power settings."""
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.local/runtime/overnight-guard-2026-10-15.json'
STOP = STATE.with_suffix('.stop')
DEADLINE = datetime.fromisoformat('2026-10-15T09:00:00+08:00')


def battery_percent(output):
    values = [int(value) for value in re.findall(r'(?<!\d)(\d{1,3})%;', output)]
    return min(values) if values and all(0 <= value <= 100 for value in values) else None


def stop_reason(now, deadline, percent):
    if now >= deadline:
        return 'deadline'
    if percent is None:
        return 'battery-unknown'
    if percent < 10:
        return 'low-battery'
    return None


def run(deadline=DEADLINE, state=STATE):
    import os
    stop = state.with_suffix('.stop')
    child = None
    status = {'pid': os.getpid(), 'deadline': deadline.isoformat(), 'caffeinatePid': None}
    state.parent.mkdir(exist_ok=True, parents=True)
    try:
        while True:
            now = datetime.now(timezone.utc)
            try:
                output = subprocess.run(['/usr/bin/pmset', '-g', 'batt'], capture_output=True, text=True, timeout=5, check=True).stdout
                percent = battery_percent(output)
            except (subprocess.SubprocessError, OSError):
                percent = None
            reason = 'stopped' if stop.exists() else stop_reason(now, deadline, percent)
            if not reason and child is None:
                seconds = max(1, math.ceil((deadline - now).total_seconds()))
                child = subprocess.Popen(['/usr/bin/caffeinate', '-di', '-t', str(seconds)])
                status['caffeinatePid'] = child.pid
            if not reason and child.poll() is not None:
                reason = 'guard-exited'
            status.update(status=reason or 'active', batteryPercent=percent, checkedAt=now.isoformat())
            state.write_text(json.dumps(status, ensure_ascii=False, indent=2) + '\n')
            if reason:
                return
            time.sleep(min(30, max(1, (deadline - now).total_seconds())))
    finally:
        if child and child.poll() is None:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait(timeout=5)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--detach', action='store_true')
    parser.add_argument('--stop', action='store_true')
    parser.add_argument('--deadline', default=DEADLINE.isoformat(), help='Explicit timezone-aware end time, at most48hours ahead')
    parser.add_argument('--state', default=str(STATE), help='Task-owned overnight-guard-YYYY-MM-DD.json inside .local/runtime')
    args = parser.parse_args()
    deadline=datetime.fromisoformat(args.deadline)
    if deadline.tzinfo is None:
        raise SystemExit('Deadline must include a timezone; no guard started.')
    state=Path(args.state).resolve()
    if state.parent != STATE.parent.resolve() or not re.fullmatch(r'overnight-guard-\d{4}-\d{2}-\d{2}\.json',state.name):
        raise SystemExit('State path must be an exact task guard file under .local/runtime.')
    stop=state.with_suffix('.stop')
    if args.stop:
        stop.touch()
        print('Stop requested for this task guard only.')
    elif args.detach:
        seconds=(deadline-datetime.now(timezone.utc)).total_seconds()
        if not 0 < seconds <= 48*3600:
            raise SystemExit('Use a future deadline within48hours; no guard started.')
        if state.exists():
            saved = json.loads(state.read_text())
            if saved.get('status') == 'active':
                raise SystemExit('Existing guard reports active; inspect ownership before starting another.')
        if stop.exists():
            raise SystemExit('Guard has a stop marker; no automatic restart.')
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()),'--deadline',deadline.isoformat(),'--state',str(state)], start_new_session=True,
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f'Task guard started pid={process.pid}; deadline={deadline.isoformat()}, battery floor=10%.')
    else:
        run(deadline,state)
