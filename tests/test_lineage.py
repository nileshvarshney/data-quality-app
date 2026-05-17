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
