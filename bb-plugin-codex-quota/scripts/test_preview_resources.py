"""Offline safety checks. No browser, build, host or account access."""
import json
from pathlib import Path
import tempfile
import unittest

from preview_resources import OwnedRun, validate_png


class ResourceTests(unittest.TestCase):
    def test_fresh_roots_preserve_existing_receipts(self):
        with tempfile.TemporaryDirectory() as parent:
            receipt = Path(parent) / "historical.png"
            receipt.write_bytes(b"keep")
            first, second = OwnedRun(Path(parent)), OwnedRun(Path(parent))
            self.assertNotEqual(first.root, second.root)
            first.cleanup_preview()
            self.assertTrue(first.root.exists())
            self.assertTrue(second.preview.exists())
            self.assertEqual(receipt.read_bytes(), b"keep")

    def test_cleanup_rejects_foreign_marker_and_symlink(self):
        with tempfile.TemporaryDirectory() as parent:
            run = OwnedRun(Path(parent))
            marker = run.preview / "owner.json"
            marker.write_text(json.dumps({"token": "foreign"}))
            with self.assertRaises(RuntimeError):
                run.cleanup_preview()
            marker.write_text(json.dumps({"token": run.token}))
            target = Path(parent) / "foreign"
            target.mkdir()
            marker.unlink()
            run.preview.rmdir()
            run.preview.symlink_to(target, target_is_directory=True)
            with self.assertRaises(RuntimeError):
                run.cleanup_preview()
            self.assertTrue(target.exists())

    def test_png_requires_decoded_non_solid_pixels(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as parent:
            path = Path(parent) / "capture.png"
            path.write_bytes(b"not a PNG")
            with self.assertRaises(Exception):
                validate_png(path)
            Image.new("RGB", (375, 812), "black").save(path)
            with self.assertRaises(RuntimeError):
                validate_png(path)
            image = Image.new("RGB", (375, 812), "black")
            image.putpixel((20, 20), (255, 255, 255))
            image.save(path)
            facts = validate_png(path)
            self.assertEqual(facts["width"], 375)
            self.assertEqual(facts["height"], 812)
            self.assertEqual(len(facts["sha256"]), 64)


if __name__ == "__main__":
    unittest.main()
