"""Hardware node management router."""

import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.node import Node, NodeStatus
from app.models.user import User
from app.schemas.node import (
    NodeCreate,
    NodeHeartbeat,
    NodeRegistrationResponse,
    NodeResponse,
    NodeUpdate,
)
from app.services.auth import get_current_user

router = APIRouter()


@router.post("/hardware/register", response_model=NodeRegistrationResponse)
async def register_node(
    node_data: NodeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Register a new hardware node."""
    # Generate API key for the node
    api_key = secrets.token_urlsafe(32)

    node = Node(
        name=node_data.name,
        host=node_data.host,
        port=node_data.port,
        api_key=api_key,
        is_shared=node_data.is_shared,
        owner_id=current_user.id,
        status=NodeStatus.OFFLINE.value,
    )
    db.add(node)
    await db.flush()
    await db.refresh(node)

    return {
        "node_id": node.id,
        "api_key": api_key,
        "message": "Node registered successfully",
    }


@router.get("/hardware", response_model=list[NodeResponse])
async def list_nodes(
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[Node]:
    """List all hardware nodes for the current user."""
    result = await db.execute(
        select(Node)
        .where((Node.owner_id == current_user.id) | (Node.is_shared == True))  # noqa: E712
        .offset(skip)
        .limit(limit)
        .order_by(Node.created_at.desc())
    )
    return list(result.scalars().all())


@router.get("/hardware/{node_id}", response_model=NodeResponse)
async def get_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Node:
    """Get a specific node."""
    result = await db.execute(
        select(Node).where(
            Node.id == node_id,
            (Node.owner_id == current_user.id) | (Node.is_shared == True),  # noqa: E712
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )
    return node


@router.patch("/hardware/{node_id}", response_model=NodeResponse)
async def update_node(
    node_id: int,
    node_update: NodeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Node:
    """Update a node."""
    result = await db.execute(
        select(Node).where(
            Node.id == node_id,
            Node.owner_id == current_user.id,
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    update_data = node_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(node, field, value)

    await db.flush()
    await db.refresh(node)
    return node


@router.delete("/hardware/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a node."""
    result = await db.execute(
        select(Node).where(
            Node.id == node_id,
            Node.owner_id == current_user.id,
        )
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    if node.status == NodeStatus.BUSY.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete node while it is busy",
        )

    await db.delete(node)


@router.post("/hardware/{node_id}/heartbeat", response_model=NodeResponse)
async def node_heartbeat(
    node_id: int,
    heartbeat: NodeHeartbeat,
    db: AsyncSession = Depends(get_db),
) -> Node:
    """Receive heartbeat from a node (called by agent)."""
    # TODO: Verify API key instead of node_id
    result = await db.execute(select(Node).where(Node.id == node_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Node not found",
        )

    # Update node info
    node.status = NodeStatus.ONLINE.value
    node.last_heartbeat = datetime.utcnow()
    node.gpu_count = heartbeat.gpu_count
    node.gpu_type = heartbeat.gpu_type
    node.gpu_memory_gb = heartbeat.gpu_memory_gb
    node.cpu_count = heartbeat.cpu_count
    node.ram_gb = heartbeat.ram_gb
    node.disk_gb = heartbeat.disk_gb
    node.gpu_utilization = heartbeat.gpu_utilization
    node.memory_utilization = heartbeat.memory_utilization
    if heartbeat.metadata:
        node.metadata = heartbeat.metadata

    await db.flush()
    await db.refresh(node)
    return node
