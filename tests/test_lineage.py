import pytest
from app.api.lineage import extract_table_refs


def test_simple_from_join():
    sql = "SELECT a.col1, b.col2 FROM orders a JOIN customers b ON a.id = b.id"
    refs = extract_table_refs(sql)
    assert "ORDERS" in refs
    assert "CUSTOMERS" in refs


def test_cte():
    sql = """
    WITH base AS (SELECT * FROM raw_orders WHERE status = 'active')
    SELECT b.*, p.name FROM base b JOIN products p ON b.product_id = p.id
    """
    refs = extract_table_refs(sql)
    assert "RAW_ORDERS" in refs
    assert "PRODUCTS" in refs
    assert "BASE" not in refs  # CTE alias must be excluded


def test_schema_qualified_name():
    sql = "SELECT * FROM mydb.myschema.my_table t INNER JOIN myschema.other_table o ON t.id = o.id"
    refs = extract_table_refs(sql)
    assert "MY_TABLE" in refs
    assert "OTHER_TABLE" in refs


def test_bad_sql_returns_empty():
    assert extract_table_refs("this is not sql @@##") == []


def test_empty_string_returns_empty():
    assert extract_table_refs("") == []


def test_whitespace_only_returns_empty():
    assert extract_table_refs("   ") == []


def test_returns_uppercase():
    sql = "SELECT * FROM MyMixedCaseTable"
    refs = extract_table_refs(sql)
    assert "MYMIXEDCASETABLE" in refs


import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from httpx import AsyncClient, ASGITransport


@pytest.mark.asyncio
async def test_get_lineage_404():
    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/lineage/nonexistent-id-12345")
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_extract_refs_used_for_upstream():
    """extract_table_refs is the source of truth for upstream detection."""
    from app.api.lineage import extract_table_refs
    sql = "SELECT o.*, c.name FROM ORDERS o JOIN CUSTOMERS c ON o.cust_id = c.id"
    refs = extract_table_refs(sql)
    assert set(refs) == {"ORDERS", "CUSTOMERS"}
