"""Render Ansible templates with synthetic credentials; never contact the Pi."""
import json
from pathlib import Path
import unittest

from jinja2 import Environment, StrictUndefined
import yaml

ROOT = Path(__file__).resolve().parents[1]
ROLE = ROOT / "ansible/roles/pi_picture_kiosk"


class TrafficDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.variables = yaml.safe_load((ROOT / "ansible/group_vars/frames.example.yml").read_text())
        self.variables["frame_uisp_connection"] = {
            "origin": "https://uisp.example.invalid",
            "device_id": "synthetic-private-device",
            "token": "synthetic-private-token",
        }
        self.jinja = Environment(undefined=StrictUndefined)
        self.jinja.filters["bool"] = bool
        self.jinja.filters["to_nice_json"] = lambda value: json.dumps(value, indent=4)

    def render(self, name):
        return self.jinja.from_string((ROLE / "templates" / name).read_text()).render(**self.variables)

    def test_public_defaults_disabled_and_private_connection_never_in_public_json(self):
        public = self.render("config.json.j2")
        self.assertFalse(json.loads(public)["widgets"]["acc_traffic"]["enabled"])
        self.variables["frame_acc_traffic_enabled"] = True
        public = self.render("config.json.j2")
        self.assertTrue(json.loads(public)["widgets"]["acc_traffic"]["enabled"])
        for value in self.variables["frame_uisp_connection"].values():
            self.assertNotIn(value, public)

    def test_private_json_and_service_reference_same_protected_file(self):
        self.assertEqual(json.loads(self.render("uisp-private.json.j2")), self.variables["frame_uisp_connection"])
        service = self.render("pi-picture-kiosk.service.j2")
        self.assertIn(f'PIFRAME_UISP_CONFIG_PATH={self.variables["frame_config_dir"]}/uisp.json', service)
        self.assertNotIn(self.variables["frame_uisp_connection"]["token"], service)

    def test_secret_task_restricts_access_and_suppresses_logs_and_diffs(self):
        tasks = yaml.safe_load((ROLE / "tasks/config.yml").read_text())
        task = next(t for t in tasks if t.get("ansible.builtin.template", {}).get("src") == "uisp-private.json.j2")
        template = task["ansible.builtin.template"]
        self.assertEqual(template["owner"], "root")
        self.assertEqual(template["group"], "{{ frame_kiosk_user }}")
        self.assertEqual(template["mode"], "0640")
        self.assertTrue(task["no_log"])
        self.assertFalse(task["diff"])
        self.assertIn("frame_uisp_connection is defined", task["when"])
        self.assertIn("Restart pi picture kiosk", task["notify"])


if __name__ == "__main__":
    unittest.main()
