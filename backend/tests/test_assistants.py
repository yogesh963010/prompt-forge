import pytest
from httpx import AsyncClient
from typing import AsyncGenerator
from backend.app.models.prompt_system import PromptSystem
from backend.app.models.prompt_module import PromptModule

pytestmark = pytest.mark.asyncio

async def test_get_assistant_context_no_module(async_client: AsyncClient, test_user_token: str):
    headers = {"Authorization": f"Bearer {test_user_token}"}
    res = await async_client.get("/assistants/9999/context", headers=headers)
    assert res.status_code == 404
