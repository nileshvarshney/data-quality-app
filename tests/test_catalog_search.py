"""Tests for catalog search service and API."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.mark.asyncio
async def test_refresh_search_index_returns_duration():
    """refresh_search_index executes REFRESH and returns ms elapsed."""
    mock_db = AsyncMock()
    mock_db.execute = AsyncMock()
    mock_db.commit = AsyncMock()

    from app.services.catalog_service import refresh_search_index
    ms = await refresh_search_index(mock_db)
    assert isinstance(ms, int)
    assert ms >= 0
    mock_db.execute.assert_called_once()


@pytest.mark.asyncio
async def test_enrich_asset_results_empty():
    """enrich_asset_results returns empty dict for empty asset_ids list."""
    mock_db = AsyncMock()
    from app.services.catalog_service import enrich_asset_results
    result = await enrich_asset_results([], mock_db)
    assert result == {}
