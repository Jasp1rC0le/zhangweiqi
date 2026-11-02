"""Account-private, local-only text-line recognition. No image URLs or runtime downloads."""
from pathlib import Path
import json
import math
import sys
import unicodedata

MODEL = "ch_PP-OCRv5_rec_mobile.onnx"
MODEL_SHA = "5825fc7ebf84ae7a412be049820b4d86d77620f204a041697b0494669b1742c5"


def roman_candidates(mask):
    """Locate three narrow, aligned vertical strokes at a text-line edge."""
    if not mask or not mask[0]:
        return []
    ys = [y for y, row in enumerate(mask) if any(row)]
    if not ys:
        return []
    top, bottom = min(ys), max(ys)
    height = bottom - top + 1
    if height < 8:
        return []
    counts = [sum(bool(mask[y][x]) for y in range(top, bottom + 1)) for x in range(len(mask[0]))]
    dense = [x for x, count in enumerate(counts) if count >= height * 0.70]
    groups = []
    for x in dense:
        if not groups or x > groups[-1][-1] + 1:
            groups.append([x])
        else:
            groups[-1].append(x)
    ink = [x for x, count in enumerate(counts) if count]
    found = []
    for i in range(len(groups) - 2):
        part = groups[i:i + 3]
        left, right = part[0][0], part[-1][-1] + 1
        widths = [len(group) for group in part]
        gaps = [part[j + 1][0] - part[j][-1] - 1 for j in range(2)]
        if right - left > height * 0.98 or right - left < height * 0.35:
            continue
        if max(widths) > max(2, height * 0.22) or min(gaps) < 1 or max(gaps) > min(gaps) * 1.8 + 1:
            continue
        if left > ink[0] + 2 and right < ink[-1] - 1:
            continue
        # A broad Chinese glyph or a horizontal connector is not a Roman numeral.
        middle = range(top + math.ceil(height * 0.2), bottom - math.ceil(height * 0.2) + 1)
        allowed = {x for group in part for x in range(group[0] - 1, group[-1] + 2)}
        extra = sum(bool(mask[y][x]) for y in middle for x in range(left, right) if x not in allowed)
        if extra > height * 0.15:
            continue
        found.append((max(0, left - 1), min(len(mask[0]), right + 1)))
    return found[:2]


def split_fields(boxes):
    if len(boxes) < 3:
        return None
    gaps = [boxes[i][1] - boxes[i - 1][3] for i in range(1, len(boxes))]
    position = max(range(len(gaps)), key=gaps.__getitem__) + 1
    others = sorted(gaps[:position - 1] + gaps[position:])
    median = others[len(others) // 2] if others else 0
    title = sum(box[3] - box[1] for box in boxes[:position]) / position
    room = sum(box[3] - box[1] for box in boxes[position:]) / (len(boxes) - position)
    if gaps[position - 1] >= max(5, median * 1.8) and room <= title * 0.96:
        return position
    return None


def validate_regions(width, height, regions):
    if not isinstance(regions, list) or not 1 <= len(regions) <= 120:
        raise ValueError("invalid region count")
    for region in regions:
        if not isinstance(region, dict) or any(type(region.get(key)) is not int for key in ["x", "y", "width", "height"]):
            raise ValueError("invalid region")
        if region["x"] < 0 or region["y"] < 0 or region["width"] < 4 or region["height"] < 4 or region["x"] + region["width"] > width or region["y"] + region["height"] > height:
            raise ValueError("invalid region bounds")


def locate_lines(image, cv2, np):
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB).astype(np.float32)
    bins = rgb.astype(np.int32) // 16
    ids = bins[:, :, 0] * 256 + bins[:, :, 1] * 16 + bins[:, :, 2]
    mode = np.bincount(ids.ravel(), minlength=4096).argmax()
    background = rgb[ids == mode].mean(0)
    brightness = rgb.mean(2)
    light = np.count_nonzero(brightness > background.mean() + 28) >= np.count_nonzero(brightness < background.mean() - 28)
    direction = (255 - background) if light else -background
    alpha = np.sum((rgb - background) * direction, axis=2) / max(1.0, float(np.sum(direction ** 2)))
    mask = alpha > 0.25
    inside = np.ones(mask.shape, np.uint8)
    if light:
        support = (np.sum((rgb - background) ** 2, axis=2) < 1800).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(support, 8)
        if count > 1:
            label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
            points = cv2.findNonZero((labels == label).astype(np.uint8))
            inside.fill(0)
            cv2.fillConvexPoly(inside, cv2.convexHull(points), 1)
            mask &= inside.astype(bool)
    clean = image.copy()
    clean[inside == 0] = background[::-1].astype(np.uint8)
    counts, boxes, start, last = mask.sum(1), [], None, 0
    for y in range(len(counts) + 2):
        if y < len(counts) and counts[y] >= 2:
            if start is None:
                start = y
            last = y
        elif start is not None:
            _, xs = np.where(mask[start:last + 1])
            if last - start >= 4 and len(xs):
                boxes.append((max(0, int(xs.min()) - 2), max(0, start - 2), min(image.shape[1], int(xs.max()) + 3), min(image.shape[0], last + 3)))
            start = None
    return clean, mask, boxes


def create_engine(model_root):
    import hashlib
    from rapidocr import RapidOCR, EngineType, LangRec, ModelType, OCRVersion

    model = model_root / MODEL
    if not model.is_file() or hashlib.sha256(model.read_bytes()).hexdigest() != MODEL_SHA:
        raise ValueError("invalid local model")
    return RapidOCR(params={
        "Global.use_det": False, "Global.use_cls": False, "Global.log_level": "error",
        "EngineConfig.onnxruntime.intra_op_num_threads": 2,
        "EngineConfig.onnxruntime.inter_op_num_threads": 1,
        "Rec.engine_type": EngineType.ONNXRUNTIME, "Rec.lang_type": LangRec.CH,
        "Rec.model_type": ModelType.MOBILE, "Rec.ocr_version": OCRVersion.PPOCRV5,
        "Rec.model_path": str(model),
    })


def recognize_regions(image_path, region_path, model_root, engine=None):
    import cv2
    import numpy as np

    image = cv2.imread(str(image_path))
    if image is None or image.shape[0] * image.shape[1] > 12_000_000 or region_path.stat().st_size > 65536:
        raise ValueError("invalid input")
    height, width = image.shape[:2]
    regions = json.loads(region_path.read_text())
    validate_regions(width, height, regions)
    if engine is None:
        engine = create_engine(model_root)

    def read(band):
        result = engine(band, use_det=False, use_cls=False)
        return (str(result.txts[0]), float(result.scores[0])) if result.txts else ("", 0.0)

    output = []
    for index, region in enumerate(regions):
        x, y, w, h = (region[key] for key in ["x", "y", "width", "height"])
        crop = image[y:y + h, x:x + w]
        clean, mask, boxes = locate_lines(crop, cv2, np)
        if not boxes or len(boxes) > 20:
            raise ValueError("unreadable text layout")
        split = split_fields(boxes)
        lines = []
        reliable = True
        for position, (left, top, right, bottom) in enumerate(boxes):
            band = clean[top:bottom, left:right]
            text, score = read(band)
            verified_marker = False
            if split is not None and position < split:
                candidates = roman_candidates(mask[top:bottom, left:right].tolist())
                if candidates and unicodedata.normalize("NFKC", text).strip() == "III":
                    verified_marker = True
                for first, last in [] if verified_marker else candidates:
                    numeral, confidence = read(band[:, first:last])
                    numeral = unicodedata.normalize("NFKC", numeral).strip()
                    if numeral not in {"I", "II", "III"} or confidence < 0.25:
                        continue
                    before = mask[top:bottom, left:left + first]
                    after = mask[top:bottom, left + last:right]
                    def has_text(part):
                        _ys, xs = np.where(part)
                        return len(xs) > 3 and int(xs.max()) - int(xs.min()) >= 2
                    prefix, prefix_score = read(band[:, :first]) if has_text(before) else ("", 1.0)
                    suffix, suffix_score = read(band[:, last:]) if has_text(after) else ("", 1.0)
                    text = prefix + "III" + suffix
                    score = min(confidence, prefix_score, suffix_score)
                    verified_marker = prefix_score >= 0.60 and suffix_score >= 0.60
                    break
            reliable &= bool(text.strip()) and (score >= 0.60 or verified_marker)
            lines.append({"text": text, "confidence": score, "x": left, "y": top, "width": right - left, "height": bottom - top})
        title = "".join(line["text"] for line in lines[:split]) if split else None
        room = "".join(line["text"] for line in lines[split:]) if split else None
        if title is not None and (not title.strip() or len(title) > 100 or len(room) > 100):
            reliable = False
        output.append({"index": index, "lines": lines, "joined": " ".join(line["text"] for line in lines), "title": title, "room": room, "reliable": bool(reliable)})
    return {"version": 1, "width": width, "height": height, "lines": [], "regions": output}


def serve(model_root, private_root):
    import select
    import uuid

    root = private_root.resolve(strict=True)
    engine = create_engine(model_root)
    engine._load_rec_model()
    print("LOCAL_OCR_READY_V1", flush=True)
    while select.select([sys.stdin], [], [], 60)[0]:
        raw = sys.stdin.buffer.readline(65537)
        if not raw:
            return
        if len(raw) > 65536 or not raw.endswith(b"\n"):
            raise ValueError("invalid frame")
        request = result = reply = None
        try:
            request = json.loads(raw)
            identity = request["id"]
            if not isinstance(identity, str) or str(uuid.UUID(identity)) != identity:
                raise ValueError("invalid identity")
            image, regions = (Path(request[key]) for key in ("image", "regions"))
            if image.parent != regions.parent:
                raise ValueError("mixed inputs")
            for path in (image, regions):
                if path.is_symlink() or not path.is_file() or not path.resolve(strict=True).is_relative_to(root):
                    raise ValueError("invalid private input")
            result = recognize_regions(image, regions, model_root, engine)
            reply = {"id": identity, "result": result, "error": None}
        except BaseException:
            identity = request.get("id") if isinstance(request, dict) else None
            reply = {"id": identity, "result": None, "error": "LOCAL_OCR_FAILED"}
        text = json.dumps(reply, ensure_ascii=False)
        if len(text.encode()) > 1024 * 1024:
            raise ValueError("output too large")
        print(text, flush=True)
        raw = request = result = reply = text = None


def main():
    def deny_network(event, _args):
        if event in {"socket.connect", "socket.getaddrinfo"}:
            raise RuntimeError("runtime network disabled")
    sys.addaudithook(deny_network)
    if len(sys.argv) != 4:
        raise ValueError("invalid invocation")
    if sys.argv[1] == "--serve":
        serve(Path(sys.argv[2]), Path(sys.argv[3]))
        return
    result = recognize_regions(Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3]))
    text = json.dumps(result, ensure_ascii=False)
    if len(text.encode()) > 1024 * 1024:
        raise ValueError("output too large")
    print(text)


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        print("LOCAL_OCR_FAILED", file=sys.stderr)
        raise SystemExit(3)
