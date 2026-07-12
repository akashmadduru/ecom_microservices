from security import extract_google_profile, is_password_strong, normalize_username


def test_password_strength_rejects_weak_passwords():
    assert is_password_strong("password") is False
    assert is_password_strong("Password1") is False
    assert is_password_strong("Password123!") is True


def test_username_normalization_is_consistent():
    assert normalize_username("  Alice  ") == "alice"
    assert normalize_username("ALICE") == "alice"


def test_google_profile_builds_user_identity():
    claims = {
        "sub": "google-user-123",
        "email": "Jane.Doe@Example.com",
        "given_name": "Jane",
        "family_name": "Doe",
    }
    profile = extract_google_profile(claims)
    assert profile["subject"] == "google-user-123"
    assert profile["email"] == "jane.doe@example.com"
    assert profile["display_name"] == "Jane Doe"
