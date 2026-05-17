"""Tests for /api/lineage/* endpoints."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi import HTTPException
from datetime import datetime


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_mock_object(object_id="obj-1", object_name="emp", object_type="TABLE"):
    """Helper: create a mock DataObject."""
    obj = MagicMock()
    obj.object_id = object_id
    obj.object_name = object_name
    obj.object_type = object_type
    obj.database_name = "PROD_DB"
    obj.schema_name = "HR_SCHEMA"
    obj.domain = "HR"
    obj.sub_domain = "Workforce"
    obj.owner = "hr@acme.com"
    obj.quality_score = 88.0
    obj.status = "active"
    obj.certification_status = "certified"
    obj.tags = ["hr"]
    obj.last_refreshed_at = None
    obj.created_at = datetime(2026, 1, 1)
    obj.updated_at = datetime(2026, 1, 1)
    return obj


def make_mock_db(get_return=None, execute_scalars=None):
    """Helper: create a mock AsyncSession with a single uniform execute() response."""
    mock_db = AsyncMock()
    mock_db.get = AsyncMock(return_value=get_return)
    result = MagicMock()
    result.scalars.return_value.all.return_value = execute_scalars or []
    result.fetchall.return_value = []
    mock_db.execute = AsyncMock(return_value=result)
    return mock_db


def make_mock_column(column_id="col-1", column_name="emp_id",
                     data_type="INTEGER", ordinal_position=1, is_nullable=False):
    """Helper: create a mock DataObjectColumn."""
    col = MagicMock()
    col.column_id = column_id
    col.column_name = column_name
    col.data_type = data_type
    col.ordinal_position = ordinal_position
    col.is_nullable = is_nullable
    return col


def make_mock_edge(relationship_id="rel-1", source_object_id="src-1",
                   target_object_id="focal-1", relationship_type="JOINS_WITH"):
    """Helper: create a mock DataObjectRelationship."""
    edge = MagicMock()
    edge.relationship_id = relationship_id
    edge.source_object_id = source_object_id
    edge.target_object_id = target_object_id
    edge.relationship_type = relationship_type
    edge.transformation_logic = None
    edge.confidence_score = 1.0
    return edge


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_get_lineage_object_returns_fields():
    """get_lineage_object returns object metadata with columns list."""
    from app.api.lineage import get_lineage_object

    obj = make_mock_object("obj-1", "emp", "TABLE")
    db = make_mock_db(get_return=obj, execute_scalars=[])

    result = await get_lineage_object("obj-1", db)

    assert result["object_id"] == "obj-1"
    assert result["object_name"] == "emp"
    assert result["object_type"] == "TABLE"
    assert result["database_name"] == "PROD_DB"
    assert result["schema_name"] == "HR_SCHEMA"
    assert result["domain"] == "HR"
    assert result["owner"] == "hr@acme.com"
    assert result["quality_score"] == 88.0
    assert result["status"] == "active"
    assert result["certification_status"] == "certified"
    assert "columns" in result
    assert isinstance(result["columns"], list)
    assert result["columns"] == []


@pytest.mark.asyncio
async def test_get_lineage_object_not_found_raises_404():
    """get_lineage_object raises 404 when object does not exist."""
    from app.api.lineage import get_lineage_object

    db = make_mock_db(get_return=None)

    with pytest.raises(HTTPException) as exc_info:
        await get_lineage_object("nonexistent", db)

    assert exc_info.value.status_code == 404
    assert "not found" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_get_lineage_graph_depth1_returns_structure():
    """get_lineage_graph depth=1 returns focal_node, nodes, and edges."""
    from app.api.lineage import get_lineage_graph

    focal = make_mock_object("focal-1", "emp_dept_v", "VIEW")
    neighbor = make_mock_object("src-1", "emp", "TABLE")
    edge = make_mock_edge(source_object_id="src-1", target_object_id="focal-1")
    col = make_mock_column()

    call_count = 0

    async def mock_execute(stmt):
        nonlocal call_count
        call_count += 1
        result = MagicMock()
        result.fetchall.return_value = []
        if call_count == 1:
            # BFS hop 1: return one edge
            result.scalars.return_value.all.return_value = [edge]
        elif call_count == 2:
            # Fetch non-focal nodes (src-1)
            result.scalars.return_value.all.return_value = [neighbor]
        else:
            # Focal node columns
            result.scalars.return_value.all.return_value = [col]
        return result

    db = AsyncMock()
    db.get = AsyncMock(return_value=focal)
    db.execute = mock_execute

    result = await get_lineage_graph("focal-1", "1", db)

    assert "focal_node" in result
    assert "nodes" in result
    assert "edges" in result
    assert result["focal_node"]["object_id"] == "focal-1"
    assert result["focal_node"]["object_name"] == "emp_dept_v"
    assert len(result["edges"]) == 1
    assert result["edges"][0]["relationship_id"] == "rel-1"
    assert result["edges"][0]["source_object_id"] == "src-1"
    assert result["edges"][0]["target_object_id"] == "focal-1"
    # Focal columns included
    assert len(result["focal_node"]["columns"]) == 1
    assert result["focal_node"]["columns"][0]["column_name"] == "emp_id"


@pytest.mark.asyncio
async def test_get_lineage_graph_invalid_depth_raises_400():
    """get_lineage_graph raises 400 for a non-numeric, non-'all' depth value."""
    from app.api.lineage import get_lineage_graph

    focal = make_mock_object()
    db = make_mock_db(get_return=focal)

    with pytest.raises(HTTPException) as exc_info:
        await get_lineage_graph("obj-1", "bad_depth", db)

    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_get_lineage_impact_empty_returns_zero():
    """get_lineage_impact returns zero counts when no downstream objects exist."""
    from app.api.lineage import get_lineage_impact

    focal = make_mock_object("focal-1", "emp", "TABLE")
    # fetchall returns no downstream targets → BFS ends immediately
    db = make_mock_db(get_return=focal, execute_scalars=[])

    result = await get_lineage_impact("focal-1", db)

    assert "impacted_views" in result
    assert "impacted_materialized_views" in result
    assert "connected_tables" in result
    assert "total_impacted" in result
    assert result["total_impacted"] == 0
    assert result["impacted_views"] == []
    assert result["impacted_materialized_views"] == []
    assert result["connected_tables"] == []


@pytest.mark.asyncio
async def test_get_lineage_columns_returns_list():
    """get_lineage_columns returns formatted column list for an object."""
    from app.api.lineage import get_lineage_columns

    obj = make_mock_object()
    col = make_mock_column("col-1", "emp_id", "INTEGER", 1, False)
    db = make_mock_db(get_return=obj, execute_scalars=[col])

    result = await get_lineage_columns("obj-1", db)

    assert result["object_id"] == "obj-1"
    assert len(result["columns"]) == 1
    assert result["columns"][0]["column_id"] == "col-1"
    assert result["columns"][0]["column_name"] == "emp_id"
    assert result["columns"][0]["data_type"] == "INTEGER"
    assert result["columns"][0]["ordinal_position"] == 1
    assert result["columns"][0]["is_nullable"] is False


@pytest.mark.asyncio
async def test_search_lineage_by_name():
    """search_lineage_objects returns matches for a name query."""
    from app.api.lineage import search_lineage_objects

    emp = make_mock_object("obj-1", "emp", "TABLE")
    db = make_mock_db(execute_scalars=[emp])

    result = await search_lineage_objects(
        q="emp", object_type=None, schema=None, domain=None,
        owner=None, status=None, min_quality=None, limit=50, db=db,
    )

    assert "results" in result
    assert "total" in result
    assert result["total"] == 1
    assert result["results"][0]["object_name"] == "emp"
    assert result["results"][0]["object_id"] == "obj-1"


@pytest.mark.asyncio
async def test_search_lineage_by_object_type():
    """search_lineage_objects filters results by object_type=VIEW."""
    from app.api.lineage import search_lineage_objects

    view_obj = make_mock_object("obj-2", "emp_dept_v", "VIEW")
    db = make_mock_db(execute_scalars=[view_obj])

    result = await search_lineage_objects(
        q=None, object_type="VIEW", schema=None, domain=None,
        owner=None, status=None, min_quality=None, limit=50, db=db,
    )

    assert result["total"] == 1
    assert result["results"][0]["object_type"] == "VIEW"
    assert result["results"][0]["object_name"] == "emp_dept_v"
