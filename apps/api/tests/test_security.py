import uuid

import jwt

from freelens_api.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_password_hash_round_trip() -> None:
    encoded = hash_password("a-long-development-password")

    assert encoded != "a-long-development-password"
    assert verify_password("a-long-development-password", encoded)
    assert not verify_password("incorrect-password", encoded)


def test_access_token_contains_expected_identity() -> None:
    user_id = uuid.uuid4()
    organization_id = uuid.uuid4()

    token = create_access_token(
        user_id=user_id,
        organization_id=organization_id,
        role="owner",
    )
    payload = decode_token(token, "access")

    assert payload["sub"] == str(user_id)
    assert payload["org"] == str(organization_id)
    assert payload["role"] == "owner"


def test_refresh_token_is_hashed_and_type_checked() -> None:
    organization_id = uuid.uuid4()
    token, expires_at = create_refresh_token(
        user_id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        organization_id=organization_id,
    )

    assert len(hash_token(token)) == 64
    assert expires_at.tzinfo is not None
    assert decode_token(token, "refresh")["org"] == str(organization_id)
    try:
        decode_token(token, "access")
    except jwt.InvalidTokenError:
        pass
    else:
        raise AssertionError("Refresh token was accepted as an access token")
