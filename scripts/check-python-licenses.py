from __future__ import annotations

import argparse
import json
import re
import sys
from importlib import metadata
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]

CLASSIFIER_TO_SPDX = {
    "License :: OSI Approved :: Apache Software License": "Apache-2.0",
    "License :: OSI Approved :: BSD License": "BSD-3-Clause",
    "License :: OSI Approved :: ISC License (ISCL)": "ISC",
    "License :: OSI Approved :: MIT License": "MIT",
    "License :: OSI Approved :: Mozilla Public License 2.0 (MPL 2.0)": "MPL-2.0",
    "License :: OSI Approved :: Python Software Foundation License": "Python-2.0",
    "License :: Public Domain": "CC0-1.0",
}

NAME_TO_SPDX = {
    "apache software license": "Apache-2.0",
    "apache-2.0": "Apache-2.0",
    "bsd": "BSD-3-Clause",
    "bsd license": "BSD-3-Clause",
    "bsd-2-clause": "BSD-2-Clause",
    "bsd-3-clause": "BSD-3-Clause",
    "isc": "ISC",
    "mit": "MIT",
    "mit license": "MIT",
    "mozilla public license 2.0": "MPL-2.0",
    "mpl-2.0": "MPL-2.0",
    "python software foundation license": "Python-2.0",
}

IGNORED_DISTRIBUTIONS = {"pip", "setuptools", "wheel"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Check Python package licenses against license-policy.json")
    parser.add_argument("--check", action="store_true", help="Exit with an error if a license is not allowed")
    parser.add_argument("--json", dest="json_path", help="Write a JSON report")
    parser.add_argument("--markdown", dest="markdown_path", help="Write a Markdown report")
    parser.add_argument("--policy", default="license-policy.json", help="Path to the license policy file")
    parser.add_argument(
        "--requirements",
        default="requirements-docs.lock.txt",
        help="Optional requirements file used to limit checked distributions",
    )
    return parser.parse_args()


def load_policy(policy_path: str) -> dict[str, object]:
    with (REPO_ROOT / policy_path).open(encoding="utf-8") as file:
        policy = json.load(file)
    allowed_licenses = policy.get("allowedLicenses", {})
    if isinstance(allowed_licenses, list):
        allowed = set(allowed_licenses)
    else:
        allowed = set(allowed_licenses.keys())
    return {
        "allowed_licenses": allowed,
        "allowed_packages": policy.get("allowedPackages", {}),
    }


def normalize_license(value: str | None) -> str:
    value = (value or "").strip()
    if not value:
        return "UNKNOWN"
    compact = re.sub(r"\s+", " ", value)
    return NAME_TO_SPDX.get(compact.lower(), compact)


def normalize_distribution_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def requirement_distribution_names(requirements_path: str) -> set[str]:
    path = REPO_ROOT / requirements_path
    if not path.exists():
        return set()

    names: set[str] = set()
    for raw_line in path.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        match = re.match(r"^([A-Za-z0-9_.-]+)", line)
        if match:
            names.add(normalize_distribution_name(match.group(1)))

    return names


def detect_license(dist: metadata.Distribution) -> str:
    meta = dist.metadata

    expression = meta.get("License-Expression")
    if expression:
        return normalize_license(expression)

    classifiers = meta.get_all("Classifier") or []
    for classifier in classifiers:
        if classifier in CLASSIFIER_TO_SPDX:
            return CLASSIFIER_TO_SPDX[classifier]

    license_value = meta.get("License")
    if license_value:
        first_line = license_value.strip().splitlines()[0]
        if len(first_line) <= 100:
            return normalize_license(first_line)

    license_classifiers = [classifier for classifier in classifiers if classifier.startswith("License ::")]
    if license_classifiers:
        return "; ".join(license_classifiers)

    return "UNKNOWN"


def expression_allowed(expression: str, allowed_licenses: set[str]) -> bool:
    normalized = normalize_license(expression).strip('"')
    if normalized in allowed_licenses:
        return True
    if normalized in {"UNKNOWN", "UNLICENSED"}:
        return False

    stripped = normalized.replace("(", "").replace(")", "").strip()
    if stripped in allowed_licenses:
        return True

    or_parts = re.split(r"\s+OR\s+", stripped, flags=re.IGNORECASE)
    if len(or_parts) > 1:
        return any(expression_allowed(part, allowed_licenses) for part in or_parts)

    and_parts = re.split(r"\s+AND\s+", stripped, flags=re.IGNORECASE)
    if len(and_parts) > 1:
        return all(expression_allowed(part, allowed_licenses) for part in and_parts)

    return False


def collect_packages(policy: dict[str, object], requirements_path: str) -> list[dict[str, object]]:
    allowed_licenses = policy["allowed_licenses"]
    allowed_packages = policy["allowed_packages"]
    assert isinstance(allowed_licenses, set)
    assert isinstance(allowed_packages, dict)

    packages = []
    required_names = requirement_distribution_names(requirements_path)
    for dist in metadata.distributions():
        name = dist.metadata.get("Name") or dist.name
        normalized_name = normalize_distribution_name(name)
        if normalized_name in IGNORED_DISTRIBUTIONS:
            continue
        if required_names and normalized_name not in required_names:
            continue

        version = dist.version
        license_name = detect_license(dist)
        package_id = f"{name}=={version}"
        exception = allowed_packages.get(package_id)
        allowed = bool(exception) or expression_allowed(license_name, allowed_licenses)
        packages.append(
            {
                "name": name,
                "version": version,
                "license": license_name,
                "id": package_id,
                "allowed": allowed,
                "policy": "package-exception" if exception else "license-policy",
                "rationale": exception or "",
            }
        )

    return sorted(packages, key=lambda item: str(item["name"]).lower())


def write_json(path_value: str, packages: list[dict[str, object]]) -> None:
    path = REPO_ROOT / path_value
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"packages": packages}, indent=2) + "\n", encoding="utf-8")


def markdown_table(packages: list[dict[str, object]]) -> str:
    lines = [
        "## Python documentation dependencies",
        "",
        "| Package | Version | License |",
        "| --- | --- | --- |",
    ]
    for package in packages:
        lines.append(
            f"| {escape_markdown(package['name'])} | {escape_markdown(package['version'])} | {escape_markdown(package['license'])} |"
        )
    return "\n".join(lines) + "\n"


def write_markdown(path_value: str, packages: list[dict[str, object]]) -> None:
    path = REPO_ROOT / path_value
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown_table(packages), encoding="utf-8")


def escape_markdown(value: object) -> str:
    return str(value).replace("|", r"\|")


def main() -> int:
    args = parse_args()
    policy = load_policy(args.policy)
    packages = collect_packages(policy, args.requirements)
    failures = [package for package in packages if not package["allowed"]]

    if args.json_path:
        write_json(args.json_path, packages)
    if args.markdown_path:
        write_markdown(args.markdown_path, packages)

    print(f"Checked {len(packages)} Python packages. {len(failures)} not allowed.")
    for failure in failures:
        print(
            f"Disallowed Python license: {failure['id']} ({failure['license']})",
            file=sys.stderr,
        )

    return 1 if args.check and failures else 0


if __name__ == "__main__":
    raise SystemExit(main())