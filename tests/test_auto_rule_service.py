import json
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.auto_rule_service import (
    _table_ref,
    _phase1_candidates,
    _build_dedup_set,
)


def _make_asset(**kwargs):
    a = MagicMock()
    a.asset_id = kwargs.get("asset_id", "asset-001")
    a.sf_database_name = kwargs.get("sf_database_name", "MY_DB")
    a.sf_schema_name = kwargs.get("sf_schema_name", "MY_SCHEMA")
    a.sf_table_name = kwargs.get("sf_table_name", "ORDERS")
    a.domain_id = kwargs.get("domain_id", "domain-001")
    a.subdomain_id = kwargs.get("subdomain_id", "sub-001")
    return a


def _make_columns():
    return [
        {"column_name": "order_id",    "data_type": "NUMBER",        "is_nullable": "NO"},
        {"column_name": "customer_id", "data_type": "VARCHAR",       "is_nullable": "NO"},
        {"column_name": "status",      "data_type": "VARCHAR",       "is_nullable": "YES"},
        {"column_name": "amount",      "data_type": "NUMBER",        "is_nullable": "YES"},
        {"column_name": "created_at",  "data_type": "TIMESTAMP_NTZ", "is_nullable": "YES"},
    ]


class TestTableRef:
    def test_with_database(self):
        asset = _make_asset(sf_database_name="DB", sf_schema_name="SCH", sf_table_name="TBL")
        assert _table_ref(asset) == '"DB"."SCH"."TBL"'

    def test_without_database(self):
        asset = _make_asset(sf_database_name=None, sf_schema_name="SCH", sf_table_name="TBL")
        assert _table_ref(asset) == '"SCH"."TBL"'


class TestPhase1Candidates:
    def test_schema_drift_always_created(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "schema_drift_check" in types

    def test_schema_drift_has_all_columns(self):
        asset = _make_asset()
        cols = _make_columns()
        rules = _phase1_candidates(asset, cols)
        drift = next(r for r in rules if r.rule_type == "schema_drift_check")
        assert drift.rule_config["expected_columns"] == [c["column_name"] for c in cols]

    def test_null_check_created_for_not_null_columns(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "null_check" in types

    def test_null_check_covers_only_not_null_columns(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        nc = next(r for r in rules if r.rule_type == "null_check")
        assert set(nc.rule_config["columns"]) == {"order_id", "customer_id"}

    def test_null_check_skipped_when_all_nullable(self):
        asset = _make_asset()
        all_nullable = [
            {"column_name": "a", "data_type": "VARCHAR", "is_nullable": "YES"},
            {"column_name": "b", "data_type": "NUMBER",  "is_nullable": "YES"},
        ]
        rules = _phase1_candidates(asset, all_nullable)
        types = [r.rule_type for r in rules]
        assert "null_check" not in types

    def test_freshness_check_created_for_timestamp_columns(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "freshness_check" in types

    def test_freshness_check_uses_correct_column(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        fc = next(r for r in rules if r.rule_type == "freshness_check")
        assert fc.target_column == "created_at"
        assert fc.rule_config["max_hours"] == 48

    def test_freshness_check_skipped_when_no_temporal_column(self):
        asset = _make_asset()
        no_dates = [
            {"column_name": "id",   "data_type": "NUMBER",  "is_nullable": "NO"},
            {"column_name": "name", "data_type": "VARCHAR", "is_nullable": "YES"},
        ]
        rules = _phase1_candidates(asset, no_dates)
        types = [r.rule_type for r in rules]
        assert "freshness_check" not in types

    def test_uniqueness_check_for_pk_named_column(self):
        asset = _make_asset(sf_table_name="ORDERS")
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "uniqueness_check" in types

    def test_uniqueness_check_target_column_is_pk(self):
        asset = _make_asset(sf_table_name="ORDERS")
        rules = _phase1_candidates(asset, _make_columns())
        uc = next(r for r in rules if r.rule_type == "uniqueness_check")
        assert uc.target_column == "order_id"

    def test_volume_check_always_created(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        types = [r.rule_type for r in rules]
        assert "volume_check" in types

    def test_all_rules_have_pending_review_status(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        for r in rules:
            assert r.status == "pending_review"
            assert r.is_active is False
            assert r.created_by == "auto_discovery"

    def test_rule_names_prefixed_with_auto(self):
        asset = _make_asset()
        rules = _phase1_candidates(asset, _make_columns())
        for r in rules:
            assert r.rule_name.startswith("Auto:")


@pytest.mark.asyncio
class TestBuildDedupSet:
    async def test_returns_set_of_tuples(self):
        mock_row1 = MagicMock()
        mock_row1.rule_type = "schema_drift_check"
        mock_row1.target_column = None

        mock_row2 = MagicMock()
        mock_row2.rule_type = "null_check"
        mock_row2.target_column = None

        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([mock_row1, mock_row2]))

        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await _build_dedup_set("asset-001", mock_db)
        assert ("schema_drift_check", None) in result
        assert ("null_check", None) in result

    async def test_returns_empty_set_when_no_rules(self):
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([]))
        mock_db = AsyncMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        result = await _build_dedup_set("asset-001", mock_db)
        assert result == set()
