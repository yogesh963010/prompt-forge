"""Prompt System Test Cases API route handlers."""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from ..database.connection import get_db
from ..dependencies.auth import get_current_user
from ..models.user import User
from ..schemas.test_case import (
    TestCaseCreate,
    TestCaseResponse,
    TestCaseRunResponse,
    TestCaseUpdate,
)
from ..services.test_service import (
    create_test_case,
    delete_test_case,
    get_test_case,
    list_test_cases,
    run_test_case,
    update_test_case,
)

router = APIRouter(
    prefix="/prompt-systems/{prompt_system_id}/tests",
    tags=["Prompt Tests"],
)


@router.post(
    "",
    response_model=TestCaseResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a test case",
    description="Creates a new test case with sample variables and expected behavior for a Prompt System.",
)
async def create_new_test_case(
    prompt_system_id: int,
    payload: TestCaseCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new test case asynchronously."""
    return await create_test_case(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=current_user.id,
        data=payload,
    )


@router.get(
    "",
    response_model=List[TestCaseResponse],
    status_code=status.HTTP_200_OK,
    summary="List all test cases",
    description="Returns all test cases defined for the specified Prompt System.",
)
async def get_test_cases(
    prompt_system_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List test cases for a Prompt System asynchronously."""
    return await list_test_cases(
        db=db,
        prompt_system_id=prompt_system_id,
        user_id=current_user.id,
    )


@router.get(
    "/{test_id}",
    response_model=TestCaseResponse,
    status_code=status.HTTP_200_OK,
    summary="Get a test case",
    description="Retrieves a single test case by its ID.",
)
async def get_single_test_case(
    prompt_system_id: int,
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single test case by ID asynchronously."""
    return await get_test_case(
        db=db,
        prompt_system_id=prompt_system_id,
        test_id=test_id,
        user_id=current_user.id,
    )


@router.patch(
    "/{test_id}",
    response_model=TestCaseResponse,
    status_code=status.HTTP_200_OK,
    summary="Update a test case",
    description="Updates variables, expected behavior, or name of an existing test case.",
)
async def update_existing_test_case(
    prompt_system_id: int,
    test_id: int,
    payload: TestCaseUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update a test case asynchronously."""
    return await update_test_case(
        db=db,
        prompt_system_id=prompt_system_id,
        test_id=test_id,
        user_id=current_user.id,
        data=payload,
    )


@router.delete(
    "/{test_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete a test case",
    description="Deletes a test case from the Prompt System.",
)
async def delete_existing_test_case(
    prompt_system_id: int,
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a test case asynchronously."""
    await delete_test_case(
        db=db,
        prompt_system_id=prompt_system_id,
        test_id=test_id,
        user_id=current_user.id,
    )
    return {
        "message": "Test case deleted successfully.",
        "id": test_id,
    }


@router.post(
    "/{test_id}/run",
    response_model=TestCaseRunResponse,
    status_code=status.HTTP_200_OK,
    summary="Run a test case",
    description="Validates variables, composes the prompt using the existing Prompt Composer, resolves variables, and generates output.",
)
async def run_single_test_case(
    prompt_system_id: int,
    test_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run a saved test case asynchronously."""
    return await run_test_case(
        db=db,
        prompt_system_id=prompt_system_id,
        test_id=test_id,
        user_id=current_user.id,
    )
