"""Tests for platform/target connection separation."""
import pytest
from app.core.config import settings


def test_platform_settings_use_sf_prefix():
    """Platform settings must use sf_platform_ prefix, not snowflake_."""
    assert hasattr(settings, "sf_platform_account")
    assert hasattr(settings, "sf_platform_user")
    assert hasattr(settings, "sf_platform_password")
    assert hasattr(settings, "sf_platform_warehouse")
    assert hasattr(settings, "sf_platform_role")


def test_removed_source_settings():
    """snowflake_database and snowflake_schema must not exist in settings."""
    assert not hasattr(settings, "snowflake_database")
    assert not hasattr(settings, "snowflake_schema")


def test_env_file_not_configured():
    """Settings must not reference a .env file."""
    config_class = settings.__class__
    model_config = getattr(config_class, "model_config", None)
    if model_config:
        assert model_config.get("env_file") is None
    else:
        inner = getattr(config_class, "Config", None)
        if inner:
            assert not hasattr(inner, "env_file") or getattr(inner, "env_file", None) is None
