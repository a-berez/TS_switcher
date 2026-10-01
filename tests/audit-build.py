"""Build/workflow regression checks; never modify product files or user archives."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV = dict(os.environ, PYTHONIOENCODING="utf-8")
ENV.pop("VERSION", None)


def run_build(work, version=None):
    env = dict(ENV)
    if version is not None:
        env["VERSION"] = version
    return subprocess.run([sys.executable, str(work / "build.py")], env=env,
                          capture_output=True, text=True, encoding="utf-8")


def archives(work):
    return {p.name: p.read_bytes() for p in work.glob("TS_switcher-*.zip")}


def check_packages(work, expected_version):
    for browser in ("chromium", "firefox"):
        with zipfile.ZipFile(work / f"TS_switcher-{browser}.zip") as bundle:
            assert bundle.testzip() is None
            names = set(bundle.namelist())
            manifest = json.loads(bundle.read("manifest.json"))
            refs = set(manifest["icons"].values()) | {manifest["options_ui"]["page"]}
            action = manifest.get("action", manifest.get("browser_action"))
            refs.add(action["default_popup"])
            refs.update(action["default_icon"].values())
            for content_script in manifest["content_scripts"]:
                refs.update(content_script["js"])
            refs.update(manifest["background"].get("scripts", []))
            if "service_worker" in manifest["background"]:
                refs.add(manifest["background"]["service_worker"])
            for page in ("popup.html", "options.html"):
                refs.update(re.findall(r'(?:src|href)="([^"#]+)"', bundle.read(page).decode()))
            refs = {ref for ref in refs if "://" not in ref}
            assert refs <= names, sorted(refs - names)
            bg = "background-firefox.js" if browser == "firefox" else "background.js"
            assert bundle.read("background.js") == (work / "src" / bg).read_bytes()
            assert manifest["version"] == expected_version
            assert manifest["manifest_version"] == (2 if browser == "firefox" else 3)
            assert "manifest-firefox.json" not in names and "background-firefox.js" not in names
            print(f"PASS {browser}: valid ZIP, {len(refs)} asset references, correct background and version {expected_version}")


with tempfile.TemporaryDirectory(prefix="audit-build-", dir=ROOT / "tests") as temp:
    work = Path(temp)
    shutil.copy2(ROOT / "build.py", work)
    shutil.copytree(ROOT / "src", work / "src")
    source_snapshot = {p.relative_to(work / "src"): p.read_bytes() for p in (work / "src").rglob("*") if p.is_file()}
    old_archive = work / "TS_switcher-old-chromium.zip"
    old_archive.write_bytes(b"previous release must survive")
    result = run_build(work)
    assert result.returncode == 0, result.stdout + result.stderr
    check_packages(work, "1.0.0.8")
    result = run_build(work, "v1.0.1")
    assert result.returncode == 0, result.stdout + result.stderr
    check_packages(work, "1.0.1")
    assert old_archive.read_bytes() == b"previous release must survive"
    for name, content in source_snapshot.items():
        assert (work / "src" / name).read_bytes() == content, f"build changed source: {name}"
    print("PASS builds preserve source manifests and previous release archives")

    good_archives = archives(work)
    for version in ("1.0.0", "1.0.0-beta.0", "1.0.0-beta.65536", "65536.0.0", "01.0.0", "1.0.0-rc.1", "../outside", "vv1.0.1", "", "0.0.0"):
        result = run_build(work, version)
        assert result.returncode != 0, f"invalid/downgrade version accepted: {version!r}"
        assert archives(work) == good_archives, f"invalid version changed outputs: {version!r}"
    print("PASS 10 invalid/downgrade versions fail before touching archives")

    for filename in ("manifest.json", "manifest-firefox.json", "popup.js", "background-firefox.js", "icons/icon16_disabled.png"):
        resource = work / "src" / filename
        content = resource.read_bytes()
        resource.unlink()
        try:
            result = run_build(work)
            assert result.returncode != 0, f"missing resource accepted: {filename}"
            assert archives(work) == good_archives, f"missing resource changed outputs: {filename}"
        finally:
            resource.write_bytes(content)
    print("PASS 5 missing mandatory resources fail before touching archives")

    for filename, bad_content in (
        ("manifest.json", b"{broken"),
        ("manifest-firefox.json", b"{broken"),
        ("manifest.json", json.dumps({**json.loads((work / "src/manifest.json").read_bytes()), "manifest_version": 2}).encode()),
        ("popup.html", b'<script src="missing.js"></script>'),
    ):
        resource = work / "src" / filename
        content = resource.read_bytes()
        resource.write_bytes(bad_content)
        try:
            result = run_build(work)
            assert result.returncode != 0, f"invalid resource accepted: {filename}"
            assert archives(work) == good_archives, f"invalid resource changed outputs: {filename}"
        finally:
            resource.write_bytes(content)
    print("PASS malformed manifests, wrong manifest platform and dangling HTML resources are rejected")
    assert not list(work.glob("ts-switcher-build-*")), "staging directory leaked"

    bash = shutil.which("bash") or "C:/Program Files/Git/bin/bash.exe"
    if Path(bash).is_file():
        for workflow in (ROOT / ".github/workflows").glob("*.yml"):
            source = workflow.read_text(encoding="utf-8")
            blocks = re.findall(r"        run: \|\n((?:(?:          .*|)\n)*)", source)
            for block in blocks:
                script = "\n".join(line[10:] if line.startswith("          ") else line for line in block.splitlines()) + "\n"
                checked = subprocess.run([bash, "-n"], input=script, capture_output=True, text=True)
                assert checked.returncode == 0, checked.stderr
                if 'body="$BODY"' in script:
                    for prev in ("", "v0.9.0"):
                        for body in ("", "Release notes"):
                            stub = f'git() {{ printf "%s" "{prev}"; }}\n'
                            output = work / "github-output"
                            output.write_text("")
                            case_env = dict(ENV, BODY=body, VERSION="v1.0.0", GITHUB_OUTPUT=str(output))
                            result = subprocess.run([bash, "-e"], input=stub + script, cwd=work, env=case_env, capture_output=True, text=True)
                            assert result.returncode == 0, result.stderr
                            result_body = (work / "body_with_link.txt").read_text().strip()
                            expected = body
                            if prev:
                                expected = (body + "\n\n" if body else "") + f"Full Changelog: `{prev}...v1.0.0`"
                            assert result_body == expected, (result_body, expected)
                    print(f"PASS {workflow.name}: four executed changelog branches")
                if 'COMMIT_MSG' in script:
                    # Execute the real step with a fake git function: no network,
                    # tag or repository mutation is performed by this regression.
                    stub = '''git() {
  case "$1" in
    fetch) return 0 ;;
    show-ref) [ "$TAG_STATE" != absent ] ;;
    rev-parse) if [ "$TAG_STATE" = same ]; then printf '%s' "$GITHUB_SHA"; else printf 'other-sha'; fi ;;
    tag|push) printf '%s\\n' "$1" >> "$GIT_CALLS" ;;
    *) return 9 ;;
  esac
}
'''
                    for state in ("absent", "same", "different", "invalid-commit", "downgrade"):
                        output = work / "tag-output"
                        calls = work / "git-calls"
                        output.write_text("")
                        calls.write_text("")
                        case_env = dict(ENV, COMMIT_MSG=("not a version" if state == "invalid-commit" else "v1.0.0" if state == "downgrade" else "v1.0.1"),
                                        GITHUB_SHA="expected-sha", TAG_STATE="absent" if state == "downgrade" else state,
                                        GITHUB_OUTPUT=str(output), GIT_CALLS=str(calls))
                        result = subprocess.run([bash, "-e"], input=stub + script, cwd=work, env=case_env, capture_output=True, text=True)
                        assert (result.returncode != 0) == (state in ("different", "downgrade")), result.stdout + result.stderr
                        assert ("should_release=true" in output.read_text()) == (state in ("absent", "same"))
                        assert calls.read_text().splitlines() == (["tag", "push"] if state == "absent" else [])
                    print(f"PASS {workflow.name}: existing-tag mismatch and downgrade block publication; matching/new tags accepted; invalid commit skipped")
            print(f"PASS {workflow.name}: Bash syntax for {len(blocks)} multiline steps")
    else:
        raise RuntimeError("Bash is required to verify release workflows")
