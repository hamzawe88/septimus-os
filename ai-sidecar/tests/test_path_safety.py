"""Offline tests for upload-path containment (no langchain, no network).

Every file path the sidecar acts on arrives in a NATS payload or an HTTP body.
Before `resolve_upload_path` existed, `huddle.speak` joined that value onto
"../backend-core" and opened it — shipping arbitrary host files to OpenAI's
transcription API. These tests pin the containment contract.
"""
import importlib
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


class TestResolveUploadPath(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(cls.root, "uploads"), exist_ok=True)
        cls.legit = os.path.join(cls.root, "uploads", "note.txt")
        with open(cls.legit, "w") as fh:
            fh.write("ok")
        os.environ["UPLOADS_ROOT"] = cls.root
        import config
        cls.config = importlib.reload(config)

    # ── allowed ──────────────────────────────────────────────────────────────
    def test_relative_path_inside_root_resolves(self):
        self.assertEqual(self.config.resolve_upload_path("uploads/note.txt"), self.legit)

    def test_absolute_path_inside_root_resolves(self):
        self.assertEqual(self.config.resolve_upload_path(self.legit), self.legit)

    def test_surrounding_whitespace_is_tolerated(self):
        self.assertEqual(self.config.resolve_upload_path("  uploads/note.txt  "), self.legit)

    # ── refused ──────────────────────────────────────────────────────────────
    def test_dot_dot_traversal_is_refused(self):
        self.assertIsNone(self.config.resolve_upload_path("../../../etc/passwd"))

    def test_absolute_path_outside_root_is_refused(self):
        self.assertIsNone(self.config.resolve_upload_path("/etc/passwd"))

    def test_traversal_embedded_after_a_valid_prefix_is_refused(self):
        self.assertIsNone(self.config.resolve_upload_path("uploads/../../../../etc/hosts"))

    def test_sibling_directory_sharing_a_prefix_is_refused(self):
        """`/tmp/rootEVIL` must not pass a containment check against `/tmp/root`."""
        sibling = self.root + "EVIL"
        os.makedirs(sibling, exist_ok=True)
        planted = os.path.join(sibling, "x.txt")
        with open(planted, "w") as fh:
            fh.write("x")
        self.assertIsNone(self.config.resolve_upload_path(planted))

    def test_empty_and_blank_are_refused(self):
        for value in ("", "   ", None):
            self.assertIsNone(self.config.resolve_upload_path(value))

    def test_missing_file_inside_root_is_refused(self):
        self.assertIsNone(self.config.resolve_upload_path("uploads/ghost.pdf"))

    def test_directory_is_not_a_readable_file(self):
        self.assertIsNone(self.config.resolve_upload_path("uploads"))


if __name__ == "__main__":
    unittest.main()
