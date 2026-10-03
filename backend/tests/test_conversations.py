import pytest
from httpx import AsyncClient
from typing import AsyncGenerator
from ..app.models.prompt_system import PromptSystem
from ..app.models.prompt_module import PromptModule

pytestmark = pytest.mark.asyncio

async def test_create_conversation_and_messages(async_client: AsyncClient, test_user_token: str, db_session):
    headers = {"Authorization": f"Bearer {test_user_token}"}
    
    # Create conversation
    res = await async_client.post("/conversations", json={"title": "Test Conv"}, headers=headers)
    assert res.status_code == 201
    conv = res.json()
    assert conv["title"] == "Test Conv"
    conv_id = conv["id"]
    
    # Create message
    res = await async_client.post(f"/conversations/{conv_id}/messages", json={"role": "user", "content": "Hello!"}, headers=headers)
    assert res.status_code == 201
    msg = res.json()
    assert msg["role"] == "user"
    assert msg["content"] == "Hello!"
    msg_id = msg["id"]
    
    # Get messages
    res = await async_client.get(f"/conversations/{conv_id}/messages", headers=headers)
    assert res.status_code == 200
    msgs = res.json()
    assert len(msgs) == 1
    assert msgs[0]["id"] == msg_id
    
    # Delete message
    res = await async_client.delete(f"/conversations/{conv_id}/messages/{msg_id}", headers=headers)
    assert res.status_code == 204
    
    # Delete conversation
    res = await async_client.delete(f"/conversations/{conv_id}", headers=headers)
    assert res.status_code == 204

async def test_invalid_role_rejected(async_client: AsyncClient, test_user_token: str, db_session):
    headers = {"Authorization": f"Bearer {test_user_token}"}
    res = await async_client.post("/conversations", json={"title": "Test Conv"}, headers=headers)
    conv_id = res.json()["id"]
    
    res = await async_client.post(f"/conversations/{conv_id}/messages", json={"role": "hacker", "content": "bad"}, headers=headers)
    assert res.status_code == 400
