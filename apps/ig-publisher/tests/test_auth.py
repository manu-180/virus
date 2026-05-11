"""Unit tests for HMAC verification."""
from __future__ import annotations

import json

import pytest

from app.auth import compute_signature, verify_signature
from app.exceptions import InvalidSignature

SECRET = "a" * 64  # 64-char hex-shaped string for tests


def test_compute_signature_matches_known_vector() -> None:
    body = b'{"hello":"world"}'
    sig = compute_signature(body, SECRET)
    assert sig.startswith("sha256=")
    # Same input → same output
    assert sig == compute_signature(body, SECRET)


def test_verify_signature_accepts_valid() -> None:
    body = json.dumps({"foo": "bar"}, separators=(",", ":")).encode()
    sig = compute_signature(body, SECRET)
    # Should not raise
    verify_signature(body, sig, SECRET)


def test_verify_signature_rejects_missing() -> None:
    with pytest.raises(InvalidSignature, match="missing"):
        verify_signature(b"x", None, SECRET)


def test_verify_signature_rejects_wrong_prefix() -> None:
    with pytest.raises(InvalidSignature, match="malformed"):
        verify_signature(b"x", "md5=abc", SECRET)


def test_verify_signature_rejects_tampered_body() -> None:
    body = b'{"x":1}'
    sig = compute_signature(body, SECRET)
    with pytest.raises(InvalidSignature, match="mismatch"):
        verify_signature(b'{"x":2}', sig, SECRET)


def test_verify_signature_rejects_wrong_secret() -> None:
    body = b'{"x":1}'
    sig = compute_signature(body, SECRET)
    with pytest.raises(InvalidSignature, match="mismatch"):
        verify_signature(body, sig, "b" * 64)
