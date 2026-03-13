from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional
import os

import yaml


@dataclass
class ProfileConfig:
  """Typed view over the ACA-Py profile YAML files."""

  label: str
  wallet_type: str
  wallet_name: str
  wallet_key: str
  admin_port: int
  http_port: int
  transport: List[str] = field(default_factory=lambda: ["http"])
  endpoints: List[str] = field(default_factory=list)
  seed: Optional[str] = None
  genesis_url: Optional[str] = None
  genesis_file: Optional[str] = None
  mediation: Optional[Dict[str, str]] = None
  extra_args: List[str] = field(default_factory=list)

  @property
  def admin_url(self) -> str:
    return f"http://127.0.0.1:{self.admin_port}"

  def to_cli_args(self) -> List[str]:
    args: List[str] = [
      "aca-py",
      "start",
      "--label",
      self.label,
      "--admin",
      "0.0.0.0",
      str(self.admin_port),
      "--wallet-type",
      self.wallet_type,
      "--wallet-name",
      self.wallet_name,
      "--wallet-key",
      self.wallet_key,
      "--auto-accept-invites",
      "--auto-provision",
      "--admin-insecure-mode",
    ]

    for transport in self.transport:
      args.extend(["--inbound-transport", transport, "0.0.0.0", str(self.http_port)])
      args.extend(["--outbound-transport", transport])

    if self.seed:
      args.extend(["--seed", self.seed])

    env_genesis_file = os.getenv("ACAPY_GENESIS_FILE")
    env_genesis_url = os.getenv("ACAPY_GENESIS_URL")

    if env_genesis_file:
      args.extend(["--genesis-file", env_genesis_file])
    elif env_genesis_url:
      args.extend(["--genesis-url", env_genesis_url])
    elif self.genesis_file:
      args.extend(["--genesis-file", self.genesis_file])
    elif self.genesis_url:
      args.extend(["--genesis-url", self.genesis_url])

    effective_endpoints = list(self.endpoints or [])
    env_endpoint = self._resolve_env_endpoint()
    if env_endpoint:
      effective_endpoints.append(env_endpoint)

    for endpoint in effective_endpoints:
      args.extend(["--endpoint", endpoint])

    if env_endpoint:
      args.extend(["--invite-base-url", env_endpoint])

    if os.getenv("ACAPY_NO_LEDGER", "").lower() == "true":
      args.append("--no-ledger")

    log_level = os.getenv("ACAPY_LOG_LEVEL")
    if log_level:
      args.extend(["--log-level", log_level])

    trace_enabled = os.getenv("ACAPY_TRACE", "").lower() == "true"
    if trace_enabled:
      args.append("--trace")
      trace_target = os.getenv("ACAPY_TRACE_TARGET")
      if trace_target:
        args.extend(["--trace-target", trace_target])
      trace_tag = os.getenv("ACAPY_TRACE_TAG")
      if trace_tag:
        args.extend(["--trace-tag", trace_tag])
      trace_label = os.getenv("ACAPY_TRACE_LABEL")
      if trace_label:
        args.extend(["--trace-label", trace_label])

    args.extend(self.extra_args)
    return args

  def _resolve_env_endpoint(self) -> Optional[str]:
    label_key = self.label.upper().replace(" ", "_")
    candidates = [os.getenv(f"{label_key}_ENDPOINT")]

    use_ngrok = os.getenv("USE_NGROK", "").lower() == "true"
    reference_domain = (
      os.getenv("REFERENCE_AGENT_NGROK_DOMAIN")
      or os.getenv("ISSUER_NGROK_DOMAIN")
      or os.getenv("VERIFIER_NGROK_DOMAIN")
    )
    verifier_test_domain = (
      os.getenv("VERIFIER_TEST_NGROK_DOMAIN")
      or os.getenv("VERIFIER_NGROK_DOMAIN")
    )

    # Only consider ngrok domains when explicitly enabled
    if use_ngrok and "ISSUER" in label_key:
      candidates.insert(0, reference_domain)
    if use_ngrok and "VERIFIER" in label_key:
      candidates.insert(0, verifier_test_domain)

    candidates.extend([
      os.getenv("ACAPY_ENDPOINT"),
      os.getenv("ACAPY_INVITE_BASE_URL"),
    ])

    for candidate in candidates:
      url = self._normalize_url(candidate)
      if url:
        return url
    return None

  @staticmethod
  def _normalize_url(value: Optional[str]) -> Optional[str]:
    if not value:
      return None
    value = value.strip()
    if not value:
      return None
    if value.startswith("http://") or value.startswith("https://"):
      return value
    return f"https://{value}"


def load_profile(path: Path) -> ProfileConfig:
  data = yaml.safe_load(path.read_text())
  profile = ProfileConfig(
    label=data["label"],
    wallet_type=data["wallet"]["type"],
    wallet_name=data["wallet"]["name"],
    wallet_key=data["wallet"]["key"],
    admin_port=int(data["ports"]["admin"]),
    http_port=int(data["ports"]["http"]),
    transport=data.get("transport", ["http"]),
    endpoints=data.get("endpoints", []),
    seed=data.get("seed"),
    genesis_url=data.get("genesis_url"),
    genesis_file=data.get("genesis_file"),
    mediation=data.get("mediation"),
    extra_args=data.get("extra_args", []),
  )
  return profile
