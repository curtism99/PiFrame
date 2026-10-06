"""Render Ansible templates with synthetic credentials; never contact the Pi."""
import json
from pathlib import Path
import unittest

from jinja2 import Environment, StrictUndefined
import yaml
from ansible.plugins.filter.core import combine

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

    def test_circuit_capacity_is_optional_public_number_independent_of_link_speed(self):
        self.assertEqual(json.loads(self.render("config.json.j2"))["widgets"]["acc_traffic"]["capacity_bps"], 0)
        self.variables["frame_acc_traffic_capacity_bps"] = 2_000_000_000
        self.assertEqual(json.loads(self.render("config.json.j2"))["widgets"]["acc_traffic"]["capacity_bps"], 2_000_000_000)
        play = yaml.safe_load((ROOT / "ansible/deploy-acc-widget.yml").read_text())[0]
        template = play["vars"]["acc_public_settings"]["capacity_bps"]
        self.assertEqual(int(self.jinja.from_string(template).render(**self.variables)), 2_000_000_000)

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

    def test_application_copy_excludes_private_config_files(self):
        tasks = yaml.safe_load((ROLE / "tasks/app.yml").read_text())
        copies = [t for t in tasks if "ansible.builtin.copy" in t]
        directories = next(t for t in copies if t["name"] == "Deploy application files")
        self.assertNotIn("config", directories["loop"])
        examples = next(t for t in copies if t["name"] == "Deploy only named public configuration examples")
        self.assertEqual(set(examples["loop"]), {"frame.config.example.json", "uisp.example.json"})
        # A private adjacent file must not become a member of the deployment set.
        for private_name in ["uisp.local.json", "frame.config.local.json"]:
            self.assertNotIn(private_name, examples["loop"])

    def test_focused_update_preserves_settings_and_never_embeds_private_connection(self):
        play = yaml.safe_load((ROOT / "ansible/deploy-acc-widget.yml").read_text())[0]
        task = next(t for t in play["tasks"] if t["name"] == "Enable only the ACC widget in existing public settings")
        self.jinja.filters["combine"] = combine
        existing = {
            "device_name": "synthetic-frame", "server": {"port": 8080},
            "display": {"mode": "slideshow"}, "clock": {"position": "bottom-right"},
            "nas_sync": {"source": "//example.invalid/photos", "sync_interval_minutes": 15},
            "widgets": {"weather": {"enabled": True, "latitude": 12.3}, "other": {"enabled": True}},
        }
        settings = {**play["vars"]["acc_public_settings"], "show_peaks": True, "capacity_bps": 2_000_000_000}
        rendered = self.jinja.from_string(task["ansible.builtin.copy"]["content"]).render(
            acc_existing_config=existing, acc_public_settings=settings, **self.variables)
        merged = json.loads(rendered)
        for key in ["device_name", "server", "display", "clock", "nas_sync"]:
            self.assertEqual(merged[key], existing[key])
        self.assertEqual(merged["widgets"]["weather"], existing["widgets"]["weather"])
        self.assertEqual(merged["widgets"]["other"], existing["widgets"]["other"])
        self.assertTrue(merged["widgets"]["acc_traffic"]["enabled"])
        self.assertEqual(merged["widgets"]["acc_traffic"]["capacity_bps"], 2_000_000_000)
        for value in self.variables["frame_uisp_connection"].values():
            self.assertNotIn(value, rendered)
        copied = next(t for t in play["tasks"] if t["name"] == "Deploy widget browser and backend code")
        self.assertEqual(copied["loop"], ["app", "server"])
        self.assertNotIn("config", copied["loop"])
        self.assertNotIn("scripts", copied["loop"])

    def test_focused_secret_provisioning_is_protected(self):
        play = yaml.safe_load((ROOT / "ansible/deploy-acc-widget.yml").read_text())[0]
        task = next(t for t in play["tasks"] if t["name"] == "Provision protected UISP Network READ connection")
        self.assertTrue(task["no_log"])
        self.assertFalse(task["diff"])
        self.assertEqual(task["ansible.builtin.template"]["owner"], "root")
        self.assertEqual(task["ansible.builtin.template"]["mode"], "0640")

    def test_focused_update_validates_manifest_without_printing_media_names(self):
        play = yaml.safe_load((ROOT / "ansible/deploy-acc-widget.yml").read_text())[0]
        task = next(t for t in play["tasks"] if t["name"] == "Validate slideshow manifest after backend update")
        self.assertTrue(task["ansible.builtin.uri"]["url"].endswith("/api/manifest"))
        self.assertTrue(task["no_log"])
        summary = next(t for t in play["tasks"] if t["name"] == "Show manifest counts without media filenames")
        self.assertEqual(set(summary["ansible.builtin.debug"]["msg"]), {"photos", "slideshow_items"})


if __name__ == "__main__":
    unittest.main()
