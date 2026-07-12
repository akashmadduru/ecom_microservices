import time
import uuid

import jwt
import pytest
from ecom_common.auth import Role, decode_token
from ecom_common.errors import UnauthorizedError

SECRET = "test-secret"
ISSUER = "ecom-auth-service"
AUDIENCE = "ecom-gateway"


def make_token(*, typ="access", role="CUSTOMER", exp_offset=300, **overrides) -> str:
    now = int(time.time())
    claims = {
        "sub": str(uuid.uuid4()),
        "role": role,
        "typ": typ,
        "jti": str(uuid.uuid4()),
        "iat": now,
        "nbf": now,
        "exp": now + exp_offset,
        "iss": ISSUER,
        "aud": AUDIENCE,
    }
    claims.update(overrides)
    return jwt.encode(claims, SECRET, algorithm="HS256")


def decode(token, **kwargs):
    return decode_token(token, secret=SECRET, algorithm="HS256", issuer=ISSUER, audience=AUDIENCE, **kwargs)


def test_valid_access_token_decodes():
    payload = decode(make_token())
    assert payload.role == Role.CUSTOMER
    assert payload.typ == "access"


def test_expired_token_rejected():
    with pytest.raises(UnauthorizedError, match="expired"):
        decode(make_token(exp_offset=-10))


def test_wrong_audience_rejected():
    with pytest.raises(UnauthorizedError):
        decode(make_token(aud="other-audience"))


def test_wrong_issuer_rejected():
    with pytest.raises(UnauthorizedError):
        decode(make_token(iss="evil-issuer"))


def test_tampered_signature_rejected():
    token = make_token()
    with pytest.raises(UnauthorizedError):
        decode(token[:-2] + "xx")


def test_refresh_token_rejected_where_access_expected():
    with pytest.raises(UnauthorizedError, match="access"):
        decode(make_token(typ="refresh"))


def test_refresh_token_accepted_when_expected():
    payload = decode(make_token(typ="refresh"), expected_typ="refresh")
    assert payload.typ == "refresh"
