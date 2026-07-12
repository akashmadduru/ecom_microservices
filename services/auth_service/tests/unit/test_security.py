import jwt
import pytest
from auth_service.config import Settings
from auth_service.security import (
    create_access_token,
    create_refresh_token,
    hash_password,
    is_password_strong,
    normalize_username,
    verify_password,
)


@pytest.fixture
def settings() -> Settings:
    return Settings(jwt_secret="unit-test-secret", database_url="sqlite+aiosqlite://", _env_file=None)


# --- password policy (behavior preserved from the original security.py) ---


@pytest.mark.parametrize(
    "password,ok",
    [
        ("Str0ng!pass", True),
        ("weakpass", False),  # no upper/digit/special
        ("SHOUTING1!", False),  # no lowercase
        ("NoSpecial1", False),
        ("Sh0rt!a", False),  # < 8 chars
        ("", False),
    ],
)
def test_password_policy(password, ok):
    assert is_password_strong(password) is ok


def test_normalize_username():
    assert normalize_username("  Alice ") == "alice"


# --- bcrypt hashing (passlib dropped; hashes remain $2b$ compatible) ---


def test_hash_roundtrip():
    hashed = hash_password("Str0ng!pass")
    assert hashed.startswith("$2b$")
    assert verify_password("Str0ng!pass", hashed)
    assert not verify_password("wrong", hashed)


def test_verify_password_handles_garbage_hash():
    assert verify_password("x", "not-a-bcrypt-hash") is False


# --- token minting ---


def test_access_token_claims(settings):
    token, jti = create_access_token(settings, user_id="u1", email="a@b.c", username="alice", role="CUSTOMER", sid="s1")
    claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience=settings.jwt_audience)
    assert claims["sub"] == "u1"
    assert claims["typ"] == "access"
    assert claims["sid"] == "s1"
    assert claims["role"] == "CUSTOMER"
    assert claims["jti"] == jti
    assert claims["exp"] - claims["iat"] == settings.access_token_expire_minutes * 60


def test_refresh_token_claims(settings):
    token, jti = create_refresh_token(settings, user_id="u1", sid="s1")
    claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"], audience=settings.jwt_audience)
    assert claims["typ"] == "refresh"
    assert claims["jti"] == jti
    assert claims["exp"] - claims["iat"] == settings.refresh_token_expire_days * 24 * 3600
